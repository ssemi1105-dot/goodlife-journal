import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type ReceiptItem = {
  name: string;
  unitPrice: number;
  quantity: number;
  originalAmount: number;
  discountAmount: number;
  finalAmount: number;
};

type ReceiptGroup = {
  label: string;
  date: string;
  items: ReceiptItem[];
  subtotal: number;
};

type ReceiptResult = {
  store: string;
  storeType: string;
  date: string;
  groups: ReceiptGroup[];
  totalAmount: number;
  discountAmount: number;
  paymentMethod: string;
  notes: string[];
};

function buildPrompt() {
  return `
너는 Goodlife Journal 쇼핑 카테고리용 한국어 영수증 OCR 분석기다.
이미지에 보이는 영수증 또는 온라인 주문 캡처를 읽고 반드시 JSON만 반환해라.

반환 스키마:
{
  "store": "구매처",
  "storeType": "costco | emart | coupang | naver | uniqlo_online | uniqlo_store | other",
  "date": "YYYY-MM-DD 또는 빈 문자열",
  "groups": [
    {
      "label": "묶음 이름. 예: 2026-05-12 주문, 일반 구매",
      "date": "YYYY-MM-DD 또는 빈 문자열",
      "items": [
        {
          "name": "상품명",
          "unitPrice": 1000,
          "quantity": 2,
          "originalAmount": 2000,
          "discountAmount": 500,
          "finalAmount": 1500
        }
      ],
      "subtotal": 1500
    }
  ],
  "totalAmount": 1500,
  "discountAmount": 500,
  "paymentMethod": "카드/현금/간편결제/기타/빈 문자열",
  "notes": ["주의사항"]
}

분석 규칙:
- 금액은 숫자만 반환한다. 쉼표, 원, 마이너스 기호는 제거한다.
- 수량이 보이지 않으면 1로 둔다.
- 상품별 최종 금액은 (단가 * 수량) - 할인금액이다.
- 코스트코 영수증의 IRC, CPN, 쿠폰, 할인 라인은 직전 상품의 discountAmount로 합산한다.
- 할인 라인을 별도 상품으로 만들지 않는다.
- 쿠팡/네이버처럼 주문일이 여러 개면 groups를 날짜별로 나눈다.
- 같은 상품이 실제로 여러 줄이면 각각 유지하되, 같은 줄이 OCR 중복으로 반복된 것 같으면 1개만 남긴다.
- 매장명, 날짜, 결제수단을 확신할 수 없으면 빈 문자열로 둔다.
- JSON 외 설명 문장은 절대 쓰지 않는다.
`;
}

function asNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/[^\d.-]/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function normalizeItem(item: Partial<ReceiptItem>): ReceiptItem {
  const quantity = Math.max(1, asNumber(item.quantity) || 1);
  const unitPrice = asNumber(item.unitPrice);
  const originalAmount = asNumber(item.originalAmount) || unitPrice * quantity;
  const discountAmount = Math.max(0, asNumber(item.discountAmount));
  const finalAmount = Math.max(0, asNumber(item.finalAmount) || originalAmount - discountAmount);
  return {
    name: String(item.name || '').trim(),
    unitPrice,
    quantity,
    originalAmount,
    discountAmount,
    finalAmount,
  };
}

function dedupeItems(items: ReceiptItem[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.name}|${item.unitPrice}|${item.quantity}|${item.discountAmount}|${item.finalAmount}`;
    if (!item.name || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function postProcess(parsed: Partial<ReceiptResult>): ReceiptResult {
  const groups = Array.isArray(parsed.groups) ? parsed.groups : [];
  const normalizedGroups = groups.map((group) => {
    const items = dedupeItems((Array.isArray(group.items) ? group.items : []).map(normalizeItem));
    const subtotal = items.reduce((sum, item) => sum + item.finalAmount, 0);
    return {
      label: String(group.label || '영수증').trim(),
      date: String(group.date || '').trim(),
      items,
      subtotal,
    };
  }).filter((group) => group.items.length > 0);

  const totalAmount = normalizedGroups.reduce((sum, group) => sum + group.subtotal, 0);
  const discountAmount = normalizedGroups.reduce(
    (sum, group) => sum + group.items.reduce((itemSum, item) => itemSum + item.discountAmount, 0),
    0,
  );

  return {
    store: String(parsed.store || '').trim(),
    storeType: String(parsed.storeType || 'other').trim(),
    date: String(parsed.date || normalizedGroups[0]?.date || '').trim(),
    groups: normalizedGroups,
    totalAmount,
    discountAmount,
    paymentMethod: String(parsed.paymentMethod || '').trim(),
    notes: Array.isArray(parsed.notes) ? parsed.notes.map((note) => String(note)) : [],
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (!ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY secret이 설정되지 않았습니다.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { images } = await req.json();
    if (!Array.isArray(images) || images.length === 0) {
      return new Response(JSON.stringify({ error: '이미지가 없습니다.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const content = [
      { type: 'text', text: buildPrompt() },
      ...images.slice(0, 5).map((image) => ({
        type: 'image',
        source: {
          type: 'base64',
          media_type: image.mediaType || 'image/jpeg',
          data: image.data,
        },
      })),
    ];

    const anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 2000,
        messages: [{ role: 'user', content }],
      }),
    });

    if (!anthropicResponse.ok) {
      const detail = await anthropicResponse.text();
      return new Response(JSON.stringify({ error: '영수증 분석 서버 요청에 실패했습니다.', detail }), {
        status: anthropicResponse.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const anthropicData = await anthropicResponse.json();
    const text = anthropicData?.content?.find((item: { type: string; text?: string }) => item.type === 'text')?.text || '{}';
    const jsonText = text.match(/\{[\s\S]*\}/)?.[0] || '{}';
    const parsed = JSON.parse(jsonText);

    return new Response(JSON.stringify(postProcess(parsed)), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : '영수증 분석 중 오류가 발생했습니다.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

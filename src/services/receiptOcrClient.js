import { supabase } from '../lib/supabaseClient';

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const [header, data] = result.split(',');
      resolve({
        data,
        mediaType: header.match(/data:(.*);base64/)?.[1] || file.type || 'image/jpeg',
      });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export async function analyzeReceipt(files) {
  const safeFiles = Array.from(files || []).filter((file) => file?.type?.startsWith('image/')).slice(0, 5);
  if (safeFiles.length === 0) throw new Error('분석할 영수증 이미지가 없습니다.');

  const images = await Promise.all(safeFiles.map(fileToBase64));
  const { data, error } = await supabase.functions.invoke('receipt-ocr', {
    body: { images },
  });

  if (error) throw new Error(`영수증 인식 요청 실패: ${error.message}`);
  if (data?.error) throw new Error(data.error);
  return data;
}

export function toGoodlifeFormat(result, selectedGroupIndexes = null) {
  const groups = selectedGroupIndexes
    ? (result.groups || []).filter((_, index) => selectedGroupIndexes.includes(index))
    : (result.groups || []);
  const allItems = groups.flatMap((group) => group.items || []);

  return {
    store: result.store || '',
    date: result.date || '',
    productItems: allItems.map((item) => ({
      name: item.name || '',
      unitPrice: item.unitPrice ?? '',
      quantity: item.quantity ?? 1,
      discountAmount: item.discountAmount || 0,
      amount: item.finalAmount || item.amount || 0,
    })),
    amount: allItems.reduce((sum, item) => sum + Number(item.finalAmount || item.amount || 0), 0),
    discountAmount: result.discountAmount || 0,
    paymentMethod: result.paymentMethod || '',
    memo: '영수증 자동인식',
  };
}

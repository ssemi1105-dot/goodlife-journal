import { useEffect, useRef, useState } from 'react';
import { CATEGORY_MAP } from '../data/categoryDefinitions';
import FieldInput from './FieldInput';
import { calcDutchPay, calcInvestment, calcKpass, formatMoney, toNumber, todayIso } from '../utils/recordUtils';
import { searchKisSymbol } from '../services/kisApiClient';
import { analyzeReceipt, toGoodlifeFormat } from '../services/receiptOcrClient';
import {
  DEFAULT_WEATHER_LOCATION,
  fetchWeatherForDate,
  getWeatherTargetDate,
  isWeatherEnabledCategory,
} from '../services/weatherClient';

function buildInitialForm(category, record) {
  const base = Object.fromEntries(category.fields.map((field) => {
    if (['tags', 'multiChoice', 'lineItems', 'photos'].includes(field.type)) return [field.id, []];
    if (field.type === 'rating') return [field.id, 0];
    if (field.type === 'boolean') return [field.id, false];
    if (field.type === 'dateRange') return [field.id, { start: '', end: '' }];
    return [field.id, ''];
  }));
  const data = record?.data || {};
  const initial = {
    ...base,
    ...data,
    date: record?.occurred_on || data.date || todayIso(),
    photo: record?.photoUrl || '',
    photoPath: data.photoPath || null,
  };
  if (data.weather || record?.weather_code !== null && record?.weather_code !== undefined) {
    initial.weather = data.weather || {
      weatherCode: record?.weather_code ?? null,
      weatherLabel: record?.weather_label || '',
      temperatureMax: record?.temperature_max ?? null,
      temperatureMin: record?.temperature_min ?? null,
      locationName: record?.weather_location || DEFAULT_WEATHER_LOCATION.name,
      latitude: record?.weather_latitude ?? DEFAULT_WEATHER_LOCATION.latitude,
      longitude: record?.weather_longitude ?? DEFAULT_WEATHER_LOCATION.longitude,
      fetchedAt: record?.weather_fetched_at || null,
    };
  }
  category.fields.forEach((field) => {
    if (field.type === 'dateRange') {
      initial[field.id] = {
        start: data[field.startId] || data.startDate || data.date || initial.date || '',
        end: data[field.endId] || data.endDate || '',
      };
    }
  });
  if (category.id === 'hospital') {
    initial.hospitalName = data.hospitalName || data.hospital || '';
    initial.medicalCost = data.medicalCost || data.amount || '';
    initial.insuranceRefund = data.insuranceRefund || '';
    initial.netMedicalCost = data.netMedicalCost || data.amount || '';
  }
  if (category.id === 'investment') {
    initial.symbol = data.symbol || data.ticker || '';
    initial.assetName = data.assetName || '';
    initial.avgBuyPrice = data.avgBuyPrice || data.buyPrice || '';
    initial.quantity = data.quantity || '';
    initial.currentPrice = data.currentPrice || '';
    initial.buyAmount = data.buyAmount || (toNumber(initial.avgBuyPrice) * toNumber(initial.quantity) || '');
    initial.currentAmount = data.currentAmount || (toNumber(initial.currentPrice) * toNumber(initial.quantity) || '');
  }
  if (category.id === 'shopping') {
    initial.productItems = data.productItems?.length ? data.productItems : data.product ? [{ name: data.product, amount: data.amount || '' }] : data.items || [];
  }
  if (category.id === 'kpass') {
    const currentMonth = todayIso().slice(0, 7);
    const kpass = calcKpass(data);
    initial.yearMonth = data.yearMonth || currentMonth;
    initial.netCost = data.netCost ?? (kpass.chargeAmount > 0 || kpass.refundAmount > 0 ? String(kpass.netCost) : '');
    initial.refundRate = data.refundRate ?? (kpass.chargeAmount > 0 ? String(kpass.refundRate) : '');
  }
  if (category.id === 'annual_leave') {
    const currentYear = String(new Date().getFullYear());
    initial.recordType = data.recordType || '';
    initial.year = data.year || currentYear;
    initial.date = data.date || record?.occurred_on || todayIso();
  }
  if (category.id === 'fishing') {
    initial.catchCount = data.catchCount || data.count || '';
    initial.targetFish = data.targetFish || data.fishTypes || [];
  }
  return initial;
}

export default function RecordModal({ categoryId, record, onClose, onSave }) {
  const category = CATEGORY_MAP[categoryId];
  const [form, setForm] = useState(() => buildInitialForm(category, record));
  const formRef = useRef(form);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [symbolSearching, setSymbolSearching] = useState(false);
  const [symbolResults, setSymbolResults] = useState([]);
  const [symbolMessage, setSymbolMessage] = useState('');
  const [formRevision, setFormRevision] = useState(0);
  const lastSymbolLookupRef = useRef('');
  const receiptInputRef = useRef(null);
  const [receiptLoading, setReceiptLoading] = useState(false);
  const [receiptMessage, setReceiptMessage] = useState('');
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherMessage, setWeatherMessage] = useState('');
  const weatherFetchKeyRef = useRef('');

  useEffect(() => {
    const nextForm = buildInitialForm(category, record);
    formRef.current = nextForm;
    setForm(nextForm);
    setFormRevision((revision) => revision + 1);
    setReceiptMessage('');
    setWeatherMessage('');
    weatherFetchKeyRef.current = '';
  }, [category, record]);

  const dutchPay = categoryId === 'dining' ? calcDutchPay(form) : null;
  const investment = categoryId === 'investment' ? calcInvestment(form) : null;
  const hospitalNet = categoryId === 'hospital' ? Math.max(0, toNumber(form.medicalCost) - toNumber(form.insuranceRefund)) : 0;

  useEffect(() => {
    if (categoryId !== 'investment') return undefined;
    const query = String(form.assetName || form.symbol || '').trim();
    if (query.length < 2) {
      setSymbolResults([]);
      setSymbolMessage('');
      return undefined;
    }

    const shouldSearchByName = Boolean(form.assetName && !form.symbol);
    const shouldSearchBySymbol = Boolean(form.symbol && !form.assetName && String(form.symbol).trim().length >= 4);
    if (!shouldSearchByName && !shouldSearchBySymbol) return undefined;

    const timer = window.setTimeout(() => {
      lookupInvestmentSymbol(query, { silent: true });
    }, 650);

    return () => window.clearTimeout(timer);
  }, [categoryId, form.assetName, form.symbol]);

  useEffect(() => {
    if (!isWeatherEnabledCategory(categoryId)) return undefined;
    const date = getWeatherTargetDate(categoryId, form);
    if (!date) return undefined;

    const weather = form.weather || {};
    const latitude = weather.latitude ?? DEFAULT_WEATHER_LOCATION.latitude;
    const longitude = weather.longitude ?? DEFAULT_WEATHER_LOCATION.longitude;
    const locationName = weather.locationName || DEFAULT_WEATHER_LOCATION.name;
    const fetchKey = `${categoryId}-${date}-${latitude}-${longitude}`;

    if (weatherFetchKeyRef.current === fetchKey) return undefined;
    if (
      weather.fetchedAt
      && weather.date === date
      && Number(weather.latitude) === Number(latitude)
      && Number(weather.longitude) === Number(longitude)
    ) {
      weatherFetchKeyRef.current = fetchKey;
      return undefined;
    }

    let cancelled = false;
    weatherFetchKeyRef.current = fetchKey;

    async function loadWeather() {
      setWeatherLoading(true);
      setWeatherMessage('');
      try {
        const nextWeather = await fetchWeatherForDate({ date, latitude, longitude, locationName });
        if (cancelled || !nextWeather) return;
        mergeFormPatch({ weather: { ...nextWeather, date } });
        setWeatherMessage(`${nextWeather.weatherLabel} · 최고 ${nextWeather.temperatureMax ?? '-'}°C`);
      } catch {
        if (!cancelled) setWeatherMessage('날씨를 불러오지 못했습니다.');
      } finally {
        if (!cancelled) setWeatherLoading(false);
      }
    }

    loadWeather();
    return () => {
      cancelled = true;
    };
  }, [
    categoryId,
    form.date,
    form.startDate,
    form.recordType,
    form.weather?.latitude,
    form.weather?.longitude,
  ]);

  function applyDerivedValues(next, fieldId) {
    if (categoryId === 'delivery' && (fieldId === 'menuItems' || fieldId === 'deliveryFee')) {
      next.totalAmount = String(toNumber(next.menuItems) + toNumber(next.deliveryFee));
    }
    if (categoryId === 'salary' && (fieldId === 'grossAmount' || fieldId === 'tax') && !toNumber(next.netAmount)) {
      next.netAmount = String(Math.max(0, toNumber(next.grossAmount) - toNumber(next.tax)));
    }
    if (categoryId === 'overseasTravel' && ['airfare', 'lodgingCost', 'localExpenses'].includes(fieldId)) {
      next.krwAmount = String(toNumber(next.airfare) + toNumber(next.lodgingCost) + toNumber(next.localExpenses));
    }
    if (categoryId === 'hospital' && ['medicalCost', 'insuranceRefund'].includes(fieldId)) {
      next.netMedicalCost = String(Math.max(0, toNumber(next.medicalCost) - toNumber(next.insuranceRefund)));
    }
    if (categoryId === 'investment' && ['avgBuyPrice', 'quantity', 'currentPrice', 'buyAmount', 'currentAmount'].includes(fieldId)) {
      const buyAmount = toNumber(next.avgBuyPrice) * toNumber(next.quantity);
      const currentAmount = toNumber(next.currentPrice) * toNumber(next.quantity);
      next.buyAmount = buyAmount > 0 ? String(buyAmount) : next.buyAmount || '';
      next.currentAmount = currentAmount > 0 ? String(currentAmount) : next.currentAmount || '';
      next.profitLoss = String(toNumber(next.currentAmount) - toNumber(next.buyAmount));
      next.profitLossRate = toNumber(next.buyAmount) > 0 ? String(((toNumber(next.currentAmount) - toNumber(next.buyAmount)) / toNumber(next.buyAmount)) * 100) : '';
    }
    if (categoryId === 'kpass' && ['chargeAmount', 'refundAmount'].includes(fieldId)) {
      const kpass = calcKpass(next);
      next.netCost = String(kpass.netCost);
      next.refundRate = String(kpass.refundRate);
    }
    return next;
  }

  function isFieldVisible(field) {
    if (categoryId !== 'annual_leave') return true;
    if (field.id === 'recordType' || field.id === 'memo') return true;
    if (!form.recordType) return false;
    if (form.recordType === 'grant') return ['year', 'grantDays'].includes(field.id);
    if (form.recordType === 'use') return ['date', 'days', 'reason'].includes(field.id);
    return true;
  }

  function prepareFormForSave(currentForm) {
    if (categoryId === 'kpass') {
      const kpass = calcKpass(currentForm);
      return {
        ...currentForm,
        netCost: String(kpass.netCost),
        refundRate: String(kpass.refundRate),
      };
    }
    if (categoryId === 'annual_leave') {
      if (currentForm.recordType === 'grant') {
        const { date, days, reason, ...grantData } = currentForm;
        return grantData;
      }
      if (currentForm.recordType === 'use') {
        const { year, grantDays, ...useData } = currentForm;
        return useData;
      }
    }
    return currentForm;
  }

  function setWeatherField(fieldId, value) {
    const isCoordinateChange = fieldId === 'latitude' || fieldId === 'longitude';
    const nextWeather = {
      ...(formRef.current.weather || {}),
      locationName: formRef.current.weather?.locationName || DEFAULT_WEATHER_LOCATION.name,
      latitude: formRef.current.weather?.latitude ?? DEFAULT_WEATHER_LOCATION.latitude,
      longitude: formRef.current.weather?.longitude ?? DEFAULT_WEATHER_LOCATION.longitude,
      [fieldId]: value,
      ...(isCoordinateChange ? {
        weatherCode: null,
        weatherLabel: '',
        temperatureMax: null,
        temperatureMin: null,
      } : {}),
      fetchedAt: null,
    };
    weatherFetchKeyRef.current = '';
    setField('weather', nextWeather);
  }

  function setField(fieldId, value) {
    setForm((current) => {
      const next = applyDerivedValues({ ...current, [fieldId]: value }, fieldId);
      formRef.current = next;
      return next;
    });
  }

  function setFieldDraft(fieldId, value) {
    formRef.current = applyDerivedValues({ ...formRef.current, [fieldId]: value }, fieldId);
  }

  function mergeFormPatch(patch) {
    setForm((current) => {
      let next = { ...current, ...patch };
      Object.keys(patch).forEach((fieldId) => {
        next = applyDerivedValues(next, fieldId);
      });
      formRef.current = next;
      return next;
    });
  }

  function applySymbolResult(result) {
    if (!result) return;
    mergeFormPatch({
      symbol: result.symbol || result.code || '',
      assetName: result.name || result.assetName || '',
    });
    setSymbolResults([]);
    setSymbolMessage(result.name && result.symbol ? `${result.name} (${result.symbol}) 적용됨` : '종목 정보가 적용되었습니다.');
  }

  async function lookupInvestmentSymbol(query, options = {}) {
    const keyword = String(query || '').trim();
    if (!keyword || symbolSearching) return;
    if (options.silent && lastSymbolLookupRef.current === keyword) return;
    lastSymbolLookupRef.current = keyword;

    setSymbolSearching(true);
    if (!options.silent) setSymbolMessage('');
    try {
      const results = await searchKisSymbol(keyword);
      setSymbolResults(results);
      if (results.length === 1) {
        applySymbolResult(results[0]);
      } else if (results.length > 1) {
        setSymbolMessage('검색 결과를 선택해주세요.');
      } else if (!options.silent) {
        setSymbolMessage('검색 결과가 없습니다. 종목명 또는 종목코드를 확인해주세요.');
      }
    } catch (err) {
      if (!options.silent) setSymbolMessage(err.message || '종목 검색에 실패했습니다.');
    } finally {
      setSymbolSearching(false);
    }
  }

  async function handleReceiptFiles(event) {
    const files = Array.from(event.target.files || []).filter((file) => file.type?.startsWith('image/')).slice(0, 5);
    if (files.length === 0) return;

    setReceiptLoading(true);
    setReceiptMessage('');
    try {
      const result = await analyzeReceipt(files);
      const formatted = toGoodlifeFormat(result);
      const currentMemo = formRef.current.memo || '';
      mergeFormPatch({
        store: formatted.store || formRef.current.store || '',
        date: formatted.date || formRef.current.date || todayIso(),
        productItems: formatted.productItems.length > 0 ? formatted.productItems : formRef.current.productItems,
        discountAmount: formatted.discountAmount || 0,
        paymentMethod: formatted.paymentMethod || formRef.current.paymentMethod || '',
        memo: currentMemo ? currentMemo : formatted.memo,
      });
      setFormRevision((revision) => revision + 1);
      setReceiptMessage(`${formatted.store || '영수증'} · ${formatted.productItems.length}개 상품 인식`);
    } catch (err) {
      setReceiptMessage('영수증 인식에 실패했습니다.');
      window.alert(err.message || '영수증 인식에 실패했습니다.');
    } finally {
      setReceiptLoading(false);
      event.target.value = '';
    }
  }

  async function submit(event) {
    event.preventDefault();
    setError('');
    const missing = category.fields.find((field) => field.required && isFieldVisible(field) && !formRef.current[field.id]);
    if (missing) {
      setError(`${missing.label} 항목을 입력해주세요.`);
      return;
    }

    setSaving(true);
    onClose();
    try {
      await onSave(categoryId, prepareFormForSave(formRef.current), record);
    } catch (err) {
      window.alert(err.message || '저장에 실패했습니다.');
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <form className="record-modal" onSubmit={submit}>
        <header className="modal-header">
          <div>
            <p className="eyebrow">{record ? '기록 수정' : '새 기록'}</p>
            <h2>{category.label}</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="닫기">×</button>
        </header>

        <div className="field-grid">
          {category.fields.map((field) => {
            if (categoryId === 'salary' && field.id === 'bonusAmount' && !form.bonus) return null;
            if (!isFieldVisible(field)) return null;
            const fieldKey = categoryId === 'shopping' && field.id === 'productItems' ? `${field.id}-${formRevision}` : field.id;
            return (
              <div className="field" key={fieldKey}>
                <span>{field.label}{field.required && <b> *</b>}</span>
                <FieldInput
                  field={field}
                  value={field.type === 'dateRange' ? { start: form[field.startId] || form[field.id]?.start || '', end: form[field.endId] || form[field.id]?.end || '' } : form[field.id]}
                  onChange={(value) => {
                    if (field.type === 'dateRange') {
                      setField(field.id, value);
                      setField(field.startId, value.start || '');
                      setField(field.endId, value.end || '');
                      return;
                    }
                    setField(field.id, value);
                  }}
                  onDraftChange={(value) => setFieldDraft(field.id, value)}
                />
              </div>
            );
          })}
        </div>

        {isWeatherEnabledCategory(categoryId) && getWeatherTargetDate(categoryId, form) && (
          <aside className="weather-box">
            <div>
              <strong>날씨 자동 기록</strong>
              <span>
                {weatherLoading
                  ? '날씨 불러오는 중...'
                  : form.weather
                    ? `${form.weather.locationName || DEFAULT_WEATHER_LOCATION.name} · ${form.weather.weatherLabel || '날씨 정보'} · 최고 ${form.weather.temperatureMax ?? '-'}°C / 최저 ${form.weather.temperatureMin ?? '-'}°C`
                    : weatherMessage || '경기도 구리시 인창동 기준으로 저장됩니다.'}
              </span>
              {weatherMessage && !weatherLoading && <p>{weatherMessage}</p>}
            </div>
            <details>
              <summary>위치 수정</summary>
              <div className="weather-location-grid">
                <input
                  type="text"
                  value={form.weather?.locationName || DEFAULT_WEATHER_LOCATION.name}
                  onChange={(event) => setWeatherField('locationName', event.target.value)}
                  placeholder="위치명"
                />
                <input
                  type="number"
                  step="0.0001"
                  value={form.weather?.latitude ?? DEFAULT_WEATHER_LOCATION.latitude}
                  onChange={(event) => setWeatherField('latitude', event.target.value)}
                  placeholder="위도"
                />
                <input
                  type="number"
                  step="0.0001"
                  value={form.weather?.longitude ?? DEFAULT_WEATHER_LOCATION.longitude}
                  onChange={(event) => setWeatherField('longitude', event.target.value)}
                  placeholder="경도"
                />
              </div>
            </details>
          </aside>
        )}

        {categoryId === 'shopping' && (
          <aside className="receipt-ocr-box">
            <input
              ref={receiptInputRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={handleReceiptFiles}
            />
            <div>
              <strong>영수증 자동 인식</strong>
              <span>영수증 사진이나 쇼핑 캡처를 읽어 상품명, 단가, 수량, 할인을 채웁니다.</span>
              {receiptMessage && <p>{receiptMessage}</p>}
            </div>
            <button
              type="button"
              className="secondary-button compact"
              onClick={() => receiptInputRef.current?.click()}
              disabled={receiptLoading}
            >
              {receiptLoading ? '인식 중...' : '영수증 선택'}
            </button>
          </aside>
        )}

        {categoryId === 'investment' && (
          <aside className="investment-symbol-helper">
            <div>
              <strong>종목 자동검색</strong>
              <span>종목명 또는 종목코드를 입력하면 자동으로 연결합니다.</span>
            </div>
            <button
              type="button"
              className="secondary-button compact"
              onClick={() => lookupInvestmentSymbol(form.assetName || form.symbol)}
              disabled={symbolSearching || !(form.assetName || form.symbol)}
            >
              {symbolSearching ? '검색 중...' : '종목 검색'}
            </button>
            {symbolMessage && <p>{symbolMessage}</p>}
            {symbolResults.length > 1 && (
              <div className="investment-symbol-results">
                {symbolResults.slice(0, 5).map((item) => (
                  <button
                    type="button"
                    key={`${item.symbol}-${item.name}`}
                    onClick={() => applySymbolResult(item)}
                  >
                    <strong>{item.name || item.assetName}</strong>
                    <span>{item.symbol || item.code}</span>
                  </button>
                ))}
              </div>
            )}
          </aside>
        )}

        {categoryId === 'dining' && toNumber(form.menuItems) > 0 && (
          <aside className="calc-box">
            <span>더치페이 예상</span>
            <strong>{formatMoney(dutchPay)}</strong>
          </aside>
        )}

        {categoryId === 'investment' && investment.buyTotal > 0 && (
          <aside className={`calc-box investment-mood ${investment.profit > 0 ? 'is-positive' : investment.profit < 0 ? 'is-negative' : 'is-neutral'}`}>
            <span>투자 계산</span>
            <strong className={investment.profit >= 0 ? 'profit-plus' : 'profit-minus'}>
              {investment.rate.toFixed(2)}% · {formatMoney(investment.profit)}
            </strong>
          </aside>
        )}

        {categoryId === 'hospital' && toNumber(form.medicalCost) > 0 && (
          <aside className="calc-box hospital-calc">
            <span>실제 부담</span>
            <strong>{formatMoney(hospitalNet)}</strong>
          </aside>
        )}

        {error && <p className="form-error">{error}</p>}

        <footer className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>취소</button>
          <button type="submit" className="primary-button" disabled={saving}>{saving ? '저장 중' : '저장'}</button>
        </footer>
      </form>
    </div>
  );
}

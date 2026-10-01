import { CATEGORY_MAP } from '../data/categoryDefinitions';
import { calcLineItemAmount, deriveRecordColumns, getSalaryNet, normalizeLineItem, toNumber } from '../utils/recordUtils';

const uploadIds = new WeakMap();
const isFile = (value) => typeof File !== 'undefined' && value instanceof File;

export function cleanRecordData(categoryId, formData) {
  const data = { ...formData };
  delete data.photo;
  delete data.weather;
  const fields = CATEGORY_MAP[categoryId]?.fields || [];
  for (const [key, value] of Object.entries(data)) {
    if (!Array.isArray(value)) continue;
    const field = fields.find((item) => item.id === key);
    data[key] = value.map((item) => {
      if (!item || typeof item !== 'object') return item;
      const { _clientId, file, previewUrl, signedUrl, url, tooLarge, ...rest } = item;
      if (field?.type !== 'lineItems') return rest;
      const normalized = normalizeLineItem(rest, field.quantityMode);
      const amount = calcLineItemAmount(normalized);
      return { ...normalized, name: String(rest.name || '').trim(),
        unitPrice: field.quantityMode ? toNumber(normalized.unitPrice) : null,
        quantity: field.quantityMode ? toNumber(normalized.quantity) : null,
        discountAmount: field.discountMode ? toNumber(rest.discountAmount) : 0,
        amount, price: amount };
    }).filter((item) => {
      if (!item || typeof item !== 'object') return Boolean(item);
      if (key === 'photos') return Boolean(item.path);
      return field?.type !== 'lineItems' || Boolean(item.name || item.amount);
    });
  }
  if (categoryId === 'salary') data.netAmount = getSalaryNet(data);
  if (categoryId === 'delivery' && Array.isArray(data.menuItems)) data.totalAmount = toNumber(data.menuItems) + toNumber(data.deliveryFee);
  if (categoryId === 'hospital') data.netMedicalCost = Math.max(0, toNumber(data.medicalCost ?? data.amount) - toNumber(data.insuranceRefund));
  const tmdb = data.title && typeof data.title === 'object' ? data.title : null;
  if (tmdb) Object.assign(data, {
    tmdbId: tmdb.id || tmdb.tmdbId || null,
    tmdbTitle: tmdb.title || tmdb.tmdbTitle || '',
    tmdbMediaType: tmdb.mediaType || tmdb.tmdbMediaType || '',
    tmdbPosterPath: tmdb.posterPath || tmdb.tmdbPosterPath || '',
    tmdbPosterUrl: tmdb.posterUrl || tmdb.poster || tmdb.tmdbPosterUrl || '',
  });
  return data;
}

export function photoPaths(record) {
  return [...new Set([record?.data?.photoPath, ...(record?.data?.photos || []).map((photo) => photo.path)].filter(Boolean))];
}

export async function fetchAllRecords(client, userId) {
  if (!userId) throw new Error('로그인 후 다시 시도해주세요.');
  const records = [];
  const ids = new Set();
  const cutoff = new Date().toISOString();
  let total = null;
  while (total === null || records.length < total) {
    const { data, count, error } = await client.from('records').select('*', { count: 'exact' })
      .eq('user_id', userId).lte('created_at', cutoff).order('id', { ascending: true })
      .range(records.length, records.length + 499);
    if (error) throw error;
    if (!Number.isInteger(count) || (total !== null && total !== count)) throw new Error('기록 목록이 변경되었습니다. 다시 불러와 주세요.');
    total = count;
    if (total === 0) break;
    if (!data?.length) throw new Error('전체 기록을 불러오지 못했습니다. 다시 시도해주세요.');
    for (const record of data) {
      if (record.user_id !== userId || ids.has(record.id)) throw new Error('기록 목록 확인에 실패했습니다. 다시 시도해주세요.');
      ids.add(record.id);
      records.push(record);
    }
  }
  if (records.length !== total) throw new Error('전체 기록 건수가 일치하지 않습니다.');
  return records.sort((a, b) => `${b.occurred_on}${b.created_at}${b.id}`.localeCompare(`${a.occurred_on}${a.created_at}${a.id}`));
}

async function cleanupPhotos(client, paths) {
  if (!paths.length) return;
  try {
    const { error } = await client.storage.from('record-photos').remove(paths);
    if (error) console.warn('[photos] cleanup pending:', error.message);
  } catch (error) {
    console.warn('[photos] cleanup pending:', error.message);
  }
}

export async function persistRecord(client, { userId, recordId, categoryId, formData, existingRecord, weatherColumns }) {
  if (!userId || !recordId) throw new Error('로그인 정보 또는 기록 ID가 없습니다.');
  if (!existingRecord) {
    const previous = await client.from('records').select('*').eq('id', recordId).eq('user_id', userId).maybeSingle();
    if (previous.error) throw previous.error;
    existingRecord = previous.data;
  }
  if (existingRecord && existingRecord.user_id !== userId) throw new Error('다른 사용자의 기록은 수정할 수 없습니다.');
  const uploadedPaths = [];
  const oldPaths = photoPaths(existingRecord);
  const data = cleanRecordData(categoryId, formData);
  async function upload(file) {
    if (!uploadIds.has(file)) uploadIds.set(file, crypto.randomUUID());
    const path = `${userId}/${recordId}/${uploadIds.get(file)}-${file.name.replace(/[^a-zA-Z0-9_.-]/g, '_')}`;
    const { error } = await client.storage.from('record-photos').upload(path, file, { upsert: true, contentType: file.type, cacheControl: '3600' });
    if (error) throw error;
    uploadedPaths.push(path);
    return path;
  }
  // Finish uploads before writing a record. A retry reuses the same record and file IDs.
  try {
    data.photoPath = isFile(formData.photo) ? await upload(formData.photo) : formData.photoPath || existingRecord?.data?.photoPath || null;
    data.photos = [];
    for (const photo of (formData.photos ?? existingRecord?.data?.photos ?? []).slice(0, 3)) {
      if (isFile(photo.file)) {
        data.photos.push({ path: await upload(photo.file), width: photo.width || null, height: photo.height || null, size: photo.file.size, type: photo.file.type });
      } else if (photo.path) {
        const { signedUrl, url, previewUrl, file, tooLarge, ...stored } = photo;
        if (!photo.path.startsWith(`${userId}/`)) throw new Error('사진 소유자를 확인하지 못했습니다.');
        data.photos.push(stored);
      }
    }
  } catch (error) {
    await cleanupPhotos(client, uploadedPaths.filter((path) => !oldPaths.includes(path)));
    throw error;
  }
  const payload = { category_id: categoryId, ...deriveRecordColumns(categoryId, data), ...weatherColumns, data, updated_at: new Date().toISOString() };
  let query;
  if (existingRecord) {
    query = client.from('records').update(payload).eq('id', recordId).eq('user_id', userId);
    if (existingRecord.updated_at) query = query.eq('updated_at', existingRecord.updated_at);
  } else {
    query = client.from('records').upsert({ ...payload, id: recordId, user_id: userId }, { onConflict: 'id' });
  }
  const result = await query.select().single();
  // Do not remove uploads after an ambiguous network failure: the DB write may have succeeded.
  if (result.error) {
    if (result.error.code === 'PGRST116') throw new Error('기록이 다른 화면에서 변경되었습니다. 입력 내용을 확인한 뒤 다시 열어주세요.');
    throw result.error;
  }
  const nextPaths = photoPaths(result.data);
  await cleanupPhotos(client, oldPaths.filter((path) => !nextPaths.includes(path)));
  return result.data;
}

export async function removeRecord(client, userId, record) {
  if (!userId || record.user_id !== userId) throw new Error('기록 소유자를 확인하지 못했습니다.');
  const { data, error } = await client.from('records').delete().eq('id', record.id).eq('user_id', userId).select('id');
  if (error) throw error;
  if (!data?.length) throw new Error('삭제할 기록을 찾을 수 없습니다. 다시 불러와 주세요.');
  await cleanupPhotos(client, photoPaths(record));
}

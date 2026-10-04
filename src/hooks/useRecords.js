import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { DEFAULT_WEATHER_LOCATION, fetchWeatherForDate, getWeatherTargetDate, isWeatherEnabledCategory, isValidWeatherCode } from '../services/weatherClient';
import { fetchAllRecords, persistRecord, photoPaths, removeRecord } from '../services/recordStorage';
import { persistWorkoutImport } from '../services/workoutImportStorage';

function deriveWeatherColumns(formData = {}) {
  const weather = formData.weather || {};
  const valid = isValidWeatherCode(weather.weatherCode);
  const number = (value) => value === null || value === undefined || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);
  return {
    weather_code: valid ? Number(weather.weatherCode) : null,
    weather_label: valid ? weather.weatherLabel || null : null,
    temperature_max: valid ? number(weather.temperatureMax) : null,
    temperature_min: valid ? number(weather.temperatureMin) : null,
    weather_location: weather.locationName || null,
    weather_latitude: number(weather.latitude),
    weather_longitude: number(weather.longitude),
    weather_fetched_at: valid ? weather.fetchedAt || null : null,
  };
}

async function attachSignedPhotoUrls(records) {
  const paths = [...new Set(records.flatMap(photoPaths))];
  const urls = new Map();
  for (let index = 0; index < paths.length; index += 100) {
    try {
      const { data, error } = await supabase.storage.from('record-photos').createSignedUrls(paths.slice(index, index + 100), 3600);
      if (error) throw error;
      (data || []).forEach((item) => { if (item.signedUrl) urls.set(item.path, item.signedUrl); });
    } catch (error) {
      // A thumbnail failure must not turn a successful record save into a failed save.
      console.warn('[photos] preview unavailable:', error.message);
    }
  }
  return records.map((record) => {
    const photos = (record.data?.photos || []).map((photo) => ({ ...photo, signedUrl: urls.get(photo.path) || null }));
    return { ...record, photoUrl: urls.get(record.data?.photoPath) || photos.find((photo) => photo.signedUrl)?.signedUrl || null,
      photoUrls: photos.map((photo) => photo.signedUrl).filter(Boolean), data: { ...record.data, photos } };
  });
}

function sortRecords(records) {
  return [...records].sort((a, b) => `${b.occurred_on}${b.created_at}${b.id}`.localeCompare(`${a.occurred_on}${a.created_at}${a.id}`));
}

export function useRecords(userId) {
  const [state, setState] = useState({ userId: null, records: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const activeUser = useRef(userId);
  const generation = useRef(0);
  activeUser.current = userId;
  const records = state.userId === userId ? state.records : [];

  const loadRecords = useCallback(async () => {
    const request = ++generation.current;
    if (!userId) {
      setState({ userId: null, records: [] });
      setLoading(false);
      setError('');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const data = await fetchAllRecords(supabase, userId);
      const attached = await attachSignedPhotoUrls(data);
      if (request === generation.current && activeUser.current === userId) setState({ userId, records: attached });
    } catch (err) {
      if (request === generation.current && activeUser.current === userId) setError(err.message || '기록을 불러오지 못했습니다.');
    } finally {
      if (request === generation.current) setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadRecords();
    return () => { generation.current += 1; };
  }, [loadRecords]);

  function patchState(record, removed = false) {
    if (activeUser.current !== userId) return;
    setState((current) => ({ userId, records: sortRecords([
      ...(removed ? [] : [record]),
      ...(current.userId === userId ? current.records : []).filter((item) => item.id !== record.id),
    ]) }));
  }

  async function saveRecord(categoryId, formData, existingRecord = null, draftId = null) {
    if (!userId) throw new Error('로그인 후 다시 시도해주세요.');
    const weatherColumns = formData.weather !== undefined || !existingRecord ? deriveWeatherColumns(formData) : {};
    const data = await persistRecord(supabase, { userId, recordId: existingRecord?.id || draftId || crypto.randomUUID(),
      categoryId, formData, existingRecord, weatherColumns });
    const [attached] = await attachSignedPhotoUrls([data]);
    patchState(attached);
    return attached;
  }

  async function deleteRecord(record) {
    await removeRecord(supabase, userId, record);
    patchState(record, true);
  }

  async function importWorkout(summary) {
    if (!userId || activeUser.current !== userId) throw new Error('로그인 후 다시 시도해주세요.');
    const result = await persistWorkoutImport(supabase, userId, summary);
    if (activeUser.current !== userId) throw new Error('사용자가 변경되었습니다. 다시 로그인해주세요.');
    patchState(result.record);
    return result;
  }

  async function exportRecords() {
    const data = await fetchAllRecords(supabase, userId);
    if (activeUser.current !== userId) throw new Error('사용자가 변경되었습니다. 다시 시도해주세요.');
    return data;
  }

  async function backfillMissingWeather(onProgress) {
    if (!userId) return { total: 0, updated: 0, failed: 0 };
    const candidates = records.filter((record) => isWeatherEnabledCategory(record.category_id)
      && !isValidWeatherCode(record.weather_code)
      && getWeatherTargetDate(record.category_id, { ...record.data, date: record.data?.date || record.occurred_on }));
    let updated = 0;
    let failed = 0;
    onProgress?.({ total: candidates.length, done: 0, updated, failed });
    for (const record of candidates) {
      if (activeUser.current !== userId) break;
      const date = getWeatherTargetDate(record.category_id, { ...record.data, date: record.data?.date || record.occurred_on });
      const oldDefault = record.weather_location === DEFAULT_WEATHER_LOCATION.name && Number(record.weather_latitude) === 37.5 && Number(record.weather_longitude) === 127;
      try {
        const weather = await fetchWeatherForDate({ date,
          latitude: oldDefault ? DEFAULT_WEATHER_LOCATION.latitude : record.weather_latitude ?? DEFAULT_WEATHER_LOCATION.latitude,
          longitude: oldDefault ? DEFAULT_WEATHER_LOCATION.longitude : record.weather_longitude ?? DEFAULT_WEATHER_LOCATION.longitude,
          locationName: record.weather_location || DEFAULT_WEATHER_LOCATION.name });
        if (!weather) throw new Error('날씨 정보가 없습니다.');
        if (activeUser.current !== userId) break;
        let query = supabase.from('records').update({ ...deriveWeatherColumns({ weather }), updated_at: new Date().toISOString() })
          .eq('id', record.id).eq('user_id', userId);
        if (record.updated_at) query = query.eq('updated_at', record.updated_at);
        const { data, error: updateError } = await query.select().single();
        if (updateError) throw updateError;
        const [attached] = await attachSignedPhotoUrls([data]);
        patchState(attached);
        updated += 1;
      } catch (err) {
        console.warn('[weather] backfill failed:', record.id, err.message);
        failed += 1;
      }
      onProgress?.({ total: candidates.length, done: updated + failed, updated, failed });
    }
    return { total: candidates.length, updated, failed };
  }

  return { records, loading, error, saveRecord, deleteRecord, importWorkout, exportRecords, reloadRecords: loadRecords, backfillMissingWeather };
}

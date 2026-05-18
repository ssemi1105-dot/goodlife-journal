import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { calcLineItemAmount, deriveRecordColumns, toNumber } from '../utils/recordUtils';

function cleanDataForSave(formData) {
  const data = { ...formData };
  delete data.photo;
  delete data.photoPath;
  delete data.weather;
  for (const [key, value] of Object.entries(data)) {
    if (Array.isArray(value)) {
      data[key] = value
        .map((item) => {
          if (!item || typeof item !== 'object') return item;
          const { _clientId, file, previewUrl, signedUrl, url, tooLarge, ...rest } = item;
          if ('amount' in rest || 'price' in rest || 'unitPrice' in rest || 'quantity' in rest) {
            const amount = calcLineItemAmount(rest);
            return {
              ...rest,
              quantity: rest.quantity === '' || rest.quantity === undefined ? null : toNumber(rest.quantity),
              unitPrice: rest.unitPrice === '' || rest.unitPrice === undefined ? null : toNumber(rest.unitPrice),
              discountAmount: rest.discountAmount === '' || rest.discountAmount === undefined ? 0 : toNumber(rest.discountAmount),
              amount,
              price: amount,
            };
          }
          return rest;
        })
        .filter((item) => {
          if (!item || typeof item !== 'object') return Boolean(item);
          if (key === 'photos') return Boolean(item.path);
          return Boolean(item.name || item.amount || item.price || item.unitPrice || item.quantity || item.rating);
        });
    }
  }
  const tmdb = data.title && typeof data.title === 'object' ? data.title : null;
  if (tmdb) {
    data.tmdbId = tmdb.id || tmdb.tmdbId || null;
    data.tmdbTitle = tmdb.title || tmdb.tmdbTitle || '';
    data.tmdbMediaType = tmdb.mediaType || tmdb.tmdbMediaType || '';
    data.tmdbPosterPath = tmdb.posterPath || tmdb.tmdbPosterPath || '';
    data.tmdbPosterUrl = tmdb.posterUrl || tmdb.poster || tmdb.tmdbPosterUrl || '';
  }
  return data;
}

function nullableNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = toNumber(value);
  return Number.isFinite(number) ? number : null;
}

function deriveWeatherColumns(formData = {}) {
  const weather = formData.weather || {};
  return {
    weather_code: weather.weatherCode === null || weather.weatherCode === undefined || weather.weatherCode === '' ? null : Number(weather.weatherCode),
    weather_label: weather.weatherLabel || null,
    temperature_max: nullableNumber(weather.temperatureMax),
    temperature_min: nullableNumber(weather.temperatureMin),
    weather_location: weather.locationName || null,
    weather_latitude: nullableNumber(weather.latitude),
    weather_longitude: nullableNumber(weather.longitude),
    weather_fetched_at: weather.fetchedAt || null,
  };
}

async function getSignedPhotoUrl(path) {
  if (!path) return null;
  const { data, error } = await supabase.storage
    .from('record-photos')
    .createSignedUrl(path, 60 * 60);
  if (error) return null;
  return data.signedUrl;
}

async function attachSignedPhotoUrls(records) {
  return Promise.all(
    records.map(async (record) => {
      const photoPath = record.data?.photoPath;
      const photoUrl = await getSignedPhotoUrl(photoPath);
      const photoUrls = await Promise.all((record.data?.photos || []).map((photo) => getSignedPhotoUrl(photo.path)));
      return {
        ...record,
        photoUrl: photoUrl || photoUrls.find(Boolean) || null,
        photoUrls: photoUrls.filter(Boolean),
        data: {
          ...record.data,
          photos: (record.data?.photos || []).map((photo, index) => ({ ...photo, signedUrl: photoUrls[index] || null })),
        },
      };
    }),
  );
}

async function attachSignedPhotoUrl(record) {
  const photoPath = record.data?.photoPath;
  const photoUrl = await getSignedPhotoUrl(photoPath);
  const photoUrls = await Promise.all((record.data?.photos || []).map((photo) => getSignedPhotoUrl(photo.path)));
  return {
    ...record,
    photoUrl: photoUrl || photoUrls.find(Boolean) || null,
    photoUrls: photoUrls.filter(Boolean),
    data: {
      ...record.data,
      photos: (record.data?.photos || []).map((photo, index) => ({ ...photo, signedUrl: photoUrls[index] || null })),
    },
  };
}

async function uploadPhoto(userId, recordId, file) {
  if (!(file instanceof File)) return null;
  const safeName = file.name.replace(/[^a-zA-Z0-9_.-]/g, '_');
  const path = `${userId}/${recordId}/${Date.now()}-${safeName}`;
  const { error } = await supabase.storage
    .from('record-photos')
    .upload(path, file, { cacheControl: '3600', upsert: false });
  if (error) throw error;
  return path;
}

async function uploadPhotos(userId, recordId, photos = []) {
  const uploaded = [];
  for (const photo of photos.slice(0, 3)) {
    if (photo.file instanceof File) {
      const safeName = photo.file.name.replace(/[^a-zA-Z0-9_.-]/g, '_');
      const path = `${userId}/${recordId}/${Date.now()}-${uploaded.length}-${safeName}`;
      const { error } = await supabase.storage
        .from('record-photos')
        .upload(path, photo.file, { cacheControl: '3600', upsert: false, contentType: photo.type || photo.file.type });
      if (error) throw error;
      uploaded.push({
        path,
        width: photo.width || null,
        height: photo.height || null,
        size: photo.size || photo.file.size,
        type: photo.type || photo.file.type || 'image/jpeg',
      });
    } else if (photo.path) {
      const { signedUrl, url, previewUrl, file, ...persisted } = photo;
      uploaded.push(persisted);
    }
  }
  return uploaded;
}

function sortRecords(records) {
  return [...records].sort((a, b) => `${b.occurred_on}${b.created_at}`.localeCompare(`${a.occurred_on}${a.created_at}`));
}

export function useRecords(userId) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);

  const loadRecords = useCallback(async () => {
    if (!userId) {
      setRecords([]);
      return;
    }

    setLoading(true);
    const { data, error } = await supabase
      .from('records')
      .select('*')
      .eq('user_id', userId)
      .order('occurred_on', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) {
      setLoading(false);
      throw error;
    }

    setRecords(await attachSignedPhotoUrls(data || []));
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    loadRecords();
  }, [loadRecords]);

  async function saveRecord(categoryId, formData, existingRecord = null) {
    const columns = deriveRecordColumns(categoryId, formData);
    const weatherColumns = deriveWeatherColumns(formData);
    let payloadData = cleanDataForSave(formData);

    if (existingRecord) {
      if (formData.photo instanceof File) {
        if (existingRecord.data?.photoPath) {
          await supabase.storage.from('record-photos').remove([existingRecord.data.photoPath]);
        }
        payloadData.photoPath = await uploadPhoto(userId, existingRecord.id, formData.photo);
      } else {
        payloadData.photoPath = formData.photoPath || existingRecord.data?.photoPath || null;
      }
      payloadData.photos = await uploadPhotos(userId, existingRecord.id, formData.photos || existingRecord.data?.photos || []);

      const { data, error } = await supabase
        .from('records')
        .update({
          category_id: categoryId,
          ...columns,
          ...weatherColumns,
          data: payloadData,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingRecord.id)
        .eq('user_id', userId)
        .select()
        .single();
      if (error) throw error;
      const updated = await attachSignedPhotoUrl(data);
      setRecords((current) => sortRecords(current.map((item) => (item.id === updated.id ? updated : item))));
      return;
    }

    const { data, error } = await supabase
      .from('records')
      .insert({
        user_id: userId,
        category_id: categoryId,
        ...columns,
        ...weatherColumns,
        data: payloadData,
      })
      .select()
      .single();
    if (error) throw error;

    if (formData.photo instanceof File) {
      payloadData = {
        ...payloadData,
        photoPath: await uploadPhoto(userId, data.id, formData.photo),
      };
      const { error: updateError } = await supabase
        .from('records')
        .update({ data: payloadData })
        .eq('id', data.id);
      if (updateError) throw updateError;
    }
    if (Array.isArray(formData.photos) && formData.photos.some((photo) => photo.file instanceof File)) {
      payloadData = {
        ...payloadData,
        photos: await uploadPhotos(userId, data.id, formData.photos),
      };
      const { error: photosUpdateError } = await supabase
        .from('records')
        .update({ data: payloadData })
        .eq('id', data.id)
        .eq('user_id', userId);
      if (photosUpdateError) throw photosUpdateError;
    }

    const inserted = await attachSignedPhotoUrl({ ...data, data: payloadData });
    setRecords((current) => sortRecords([inserted, ...current]));
  }

  async function deleteRecord(record) {
    if (record.data?.photoPath) {
      await supabase.storage.from('record-photos').remove([record.data.photoPath]);
    }

    const photoPaths = (record.data?.photos || []).map((photo) => photo.path).filter(Boolean);
    if (photoPaths.length > 0) {
      await supabase.storage.from('record-photos').remove(photoPaths);
    }

    const { error } = await supabase.from('records').delete().eq('id', record.id).eq('user_id', userId);
    if (error) throw error;
    setRecords((current) => current.filter((item) => item.id !== record.id));
  }

  return { records, loading, saveRecord, deleteRecord, reloadRecords: loadRecords };
}

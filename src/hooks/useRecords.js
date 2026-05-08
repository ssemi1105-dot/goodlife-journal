import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { deriveRecordColumns } from '../utils/recordUtils';

function cleanDataForSave(formData) {
  const data = { ...formData };
  delete data.photo;
  for (const [key, value] of Object.entries(data)) {
    if (Array.isArray(value)) {
      data[key] = value.map((item) => {
        if (!item || typeof item !== 'object') return item;
        const { _clientId, ...rest } = item;
        return rest;
      });
    }
  }
  return data;
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
      return { ...record, photoUrl };
    }),
  );
}

async function attachSignedPhotoUrl(record) {
  const photoPath = record.data?.photoPath;
  const photoUrl = await getSignedPhotoUrl(photoPath);
  return { ...record, photoUrl };
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

      const { data, error } = await supabase
        .from('records')
        .update({
          category_id: categoryId,
          ...columns,
          data: payloadData,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingRecord.id)
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

    const inserted = await attachSignedPhotoUrl({ ...data, data: payloadData });
    setRecords((current) => sortRecords([inserted, ...current]));
  }

  async function deleteRecord(record) {
    if (record.data?.photoPath) {
      await supabase.storage.from('record-photos').remove([record.data.photoPath]);
    }

    const { error } = await supabase.from('records').delete().eq('id', record.id);
    if (error) throw error;
    setRecords((current) => current.filter((item) => item.id !== record.id));
  }

  return { records, loading, saveRecord, deleteRecord, reloadRecords: loadRecords };
}

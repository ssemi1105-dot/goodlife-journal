import { useEffect, useRef, useState } from 'react';

const MAX_PHOTOS = 3;
const TARGET_BYTES = 300 * 1024;
const FALLBACK_BYTES = 500 * 1024;
const MAX_EDGE = 1280;

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = reject;
    image.src = url;
  });
}

function canvasToBlob(canvas, quality) {
  return new Promise((resolve) => {
    canvas.toBlob(resolve, 'image/jpeg', quality);
  });
}

async function compressImage(file) {
  const image = await loadImage(file);
  const ratio = Math.min(1, MAX_EDGE / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * ratio));
  const height = Math.max(1, Math.round(image.naturalHeight * ratio));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  context.drawImage(image, 0, 0, width, height);

  let blob = null;
  for (const quality of [0.82, 0.72, 0.62, 0.52]) {
    blob = await canvasToBlob(canvas, quality);
    if (blob && blob.size <= TARGET_BYTES) break;
  }
  if (!blob) throw new Error('이미지 압축에 실패했습니다.');

  const compressedFile = new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' });
  return {
    file: compressedFile,
    previewUrl: URL.createObjectURL(compressedFile),
    width,
    height,
    size: compressedFile.size,
    type: 'image/jpeg',
    tooLarge: compressedFile.size > FALLBACK_BYTES,
  };
}

export default function PhotoUploader({ value = [], onChange }) {
  const [photos, setPhotos] = useState(Array.isArray(value) ? value : []);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    setPhotos(Array.isArray(value) ? value : []);
  }, [value]);

  async function selectFiles(event) {
    const files = Array.from(event.target.files || []).slice(0, Math.max(0, MAX_PHOTOS - photos.length));
    if (files.length === 0) return;
    setBusy(true);
    try {
      const compressed = [];
      for (const file of files) {
        compressed.push(await compressImage(file));
      }
      const next = [...photos, ...compressed].slice(0, MAX_PHOTOS);
      setPhotos(next);
      onChange(next);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  function remove(index) {
    const next = photos.filter((_, itemIndex) => itemIndex !== index);
    setPhotos(next);
    onChange(next);
  }

  return (
    <div className="photo-uploader">
      <div className="photo-preview-grid">
        {photos.map((photo, index) => (
          <div key={photo.path || photo.previewUrl || index}>
            <img src={photo.previewUrl || photo.url || photo.signedUrl} alt="" />
            <button type="button" onClick={() => remove(index)}>×</button>
            {photo.size && <small>{Math.round(photo.size / 1024)}KB</small>}
          </div>
        ))}
      </div>
      <label className="photo-add-button">
        {busy ? '압축 중' : photos.length >= MAX_PHOTOS ? '최대 3장' : '사진 추가'}
        <input ref={inputRef} type="file" accept="image/*" multiple disabled={busy || photos.length >= MAX_PHOTOS} onChange={selectFiles} />
      </label>
      <p className="input-hint">사진은 업로드 전 약 300KB 수준으로 압축됩니다.</p>
    </div>
  );
}

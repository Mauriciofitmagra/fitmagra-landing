// Canvas re-encoding removes location metadata; if it fails, the original is uploaded.
for (const form of document.querySelectorAll('form[data-resize]')) {
  let processing = false;
  let resubmitting = false;
  form.addEventListener('submit', async (event) => {
    if (resubmitting) return;
    if (processing) { event.preventDefault(); return; }
    const input = form.querySelector('input[type="file"]');
    const status = form.querySelector('[data-photo-status]');
    const file = input?.files?.[0];
    if (!file || !['image/jpeg', 'image/webp'].includes(file.type)) return;
    event.preventDefault();
    processing = true;
    status.textContent = 'Preparando la foto…';
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close?.();
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
      if (input.files[0] !== file) {
        status.textContent = 'La selección cambió. Pulsa Subir de nuevo.';
        processing = false;
        return;
      }
      if (!blob || !blob.size) throw new Error('Image conversion failed');
      const files = new DataTransfer();
      files.items.add(new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' }));
      input.files = files.files;
    } catch {
      if (input.files[0] !== file) {
        status.textContent = 'La selección cambió. Pulsa Subir de nuevo.';
        processing = false;
        return;
      }
    }
    processing = false;
    status.textContent = '';
    resubmitting = true;
    try { form.requestSubmit(); } finally { resubmitting = false; }
  });
}

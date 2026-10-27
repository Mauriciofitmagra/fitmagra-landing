// Shrinks a progress photo to 2000 px on its long side and re-encodes it as JPEG before upload.
// Drawing through a canvas drops EXIF data, including GPS location (spec 11.2). Without this script
// the original file uploads unchanged and the server still enforces type and size.
for (const form of document.querySelectorAll('form[data-resize]')) {
  form.addEventListener('submit', async (event) => {
    const input = form.querySelector('input[type="file"]');
    const file = input?.files?.[0];
    if (!file || !file.type.startsWith('image/') || form.dataset.resized) return;
    event.preventDefault();
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
      const files = new DataTransfer();
      files.items.add(new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' }));
      input.files = files.files;
    } catch {
      // Keep the original file; the server checks it.
    }
    form.dataset.resized = '1';
    form.requestSubmit();
  });
}

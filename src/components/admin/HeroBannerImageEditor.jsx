import { useRef, useState } from 'react';
import { ImagePlus, Link2, Loader2, Trash2, Upload } from 'lucide-react';

const ACCEPT_IMAGES = 'image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.gif,.heic,.heif';

function isValidImageUrl(url) {
  return /^https?:\/\/.+/i.test((url || '').trim());
}

export function HeroBannerImageEditor({
  imageUrl = '',
  onChange,
  onUpload,
  onError,
  uploading = false,
}) {
  const [urlInput, setUrlInput] = useState('');
  const fileInputRef = useRef(null);

  const applyUrl = () => {
    const url = urlInput.trim();
    if (!url) return;
    if (!isValidImageUrl(url)) {
      onError?.('La URL debe comenzar con http:// o https://');
      return;
    }
    onChange?.(url);
    setUrlInput('');
  };

  const handleFiles = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !onUpload) return;
    try {
      const url = await onUpload(file);
      onChange?.(url);
    } catch (err) {
      onError?.(err?.message || 'No se pudo subir la imagen');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="admin-hero-editor">
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPT_IMAGES}
        className="hidden"
        onChange={handleFiles}
      />

      <div className="admin-hero-editor__preview">
        {imageUrl ? (
          <img src={imageUrl} alt="Vista previa del banner" />
        ) : (
          <div className="admin-hero-editor__empty">
            <ImagePlus className="h-8 w-8" strokeWidth={1.4} />
            <span>Sin foto de portada</span>
          </div>
        )}
      </div>

      <div className="admin-hero-editor__tools">
        <div className="admin-hero-editor__url">
          <div className="relative min-w-0 flex-1">
            <Link2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
            <input
              type="url"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="https://… o pega el enlace de la foto"
              className="admin-config-input admin-hero-editor__input"
              disabled={uploading}
            />
          </div>
          <button
            type="button"
            onClick={applyUrl}
            disabled={!urlInput.trim() || uploading}
            className="admin-hero-editor__btn"
          >
            Usar URL
          </button>
        </div>

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="admin-hero-editor__upload"
        >
          {uploading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Subiendo foto…
            </>
          ) : (
            <>
              <Upload className="h-4 w-4" />
              Subir foto desde el PC
            </>
          )}
        </button>

        {imageUrl ? (
          <button
            type="button"
            onClick={() => onChange?.('')}
            disabled={uploading}
            className="admin-hero-editor__remove"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Quitar foto (se usará la portada por defecto)
          </button>
        ) : null}
      </div>
    </div>
  );
}

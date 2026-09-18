"""Validate and canonicalize private CEO signature images."""
import io
from PIL import Image, UnidentifiedImageError

MAX_SIGNATURE_BYTES = 2 * 1024 * 1024


def normalize_signature(content: bytes, mime_type: str) -> bytes:
    formats = {'image/png': 'PNG', 'image/jpeg': 'JPEG', 'image/webp': 'WEBP'}
    if mime_type not in formats:
        raise ValueError('Gunakan PNG, JPEG atau WebP')
    if not content or len(content) > MAX_SIGNATURE_BYTES:
        raise ValueError('Saiz fail mesti antara 1 bait dan 2 MB')
    try:
        with Image.open(io.BytesIO(content)) as image:
            if image.format != formats[mime_type]:
                raise ValueError('Format fail tidak sepadan dengan jenis gambar')
            if image.width > 4000 or image.height > 4000:
                raise ValueError('Dimensi gambar maksimum 4000 × 4000')
            if getattr(image, 'n_frames', 1) != 1:
                raise ValueError('Gunakan gambar statik, bukan animasi')
            image.load()
            result = io.BytesIO()
            image.convert('RGBA').save(result, format='PNG', optimize=True)
            data = result.getvalue()
            if len(data) > MAX_SIGNATURE_BYTES:
                raise ValueError('Gambar PNG selepas pemprosesan melebihi 2 MB')
            return data
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as exc:
        raise ValueError('Fail gambar tidak sah') from exc

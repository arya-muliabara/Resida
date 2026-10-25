from pathlib import Path
from uuid import uuid4

from fastapi import UploadFile
from PIL import Image, ImageOps

from app.core.config import get_settings

IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tif", ".tiff"}
MAX_IMAGE_DIMENSION = 1920


def save_compressed_image(file: UploadFile, root: Path) -> str | None:
    suffix = Path(file.filename or "").suffix.lower()
    if not (str(file.content_type or "").startswith("image/") or suffix in IMAGE_SUFFIXES):
        return None
    try:
        file.file.seek(0)
        with Image.open(file.file) as source:
            if getattr(source, "is_animated", False):
                file.file.seek(0)
                return None
            image = ImageOps.exif_transpose(source)
            image.thumbnail((MAX_IMAGE_DIMENSION, MAX_IMAGE_DIMENSION), Image.Resampling.LANCZOS)
            has_alpha = image.mode in {"RGBA", "LA"} or (image.mode == "P" and "transparency" in image.info)
            image = image.convert("RGBA" if has_alpha else "RGB")
            filename = f"{uuid4().hex}.webp"
            image.save(root / filename, format="WEBP", quality=80, method=6)
            return filename
    except (OSError, ValueError):
        file.file.seek(0)
        return None


def save_upload(file: UploadFile, folder: str) -> str:
    settings = get_settings()
    root = settings.upload_path / folder
    root.mkdir(parents=True, exist_ok=True)
    filename = save_compressed_image(file, root)
    if filename:
        return f"{settings.public_upload_url_prefix}/{folder}/{filename}"
    suffix = Path(file.filename or "").suffix.lower()
    filename = f"{uuid4().hex}{suffix}"
    destination = root / filename
    file.file.seek(0)
    with destination.open("wb") as out:
        while chunk := file.file.read(1024 * 1024):
            out.write(chunk)
    return f"{settings.public_upload_url_prefix}/{folder}/{filename}"

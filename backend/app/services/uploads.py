from pathlib import Path
from uuid import uuid4

from fastapi import UploadFile

from app.core.config import get_settings


def save_upload(file: UploadFile, folder: str) -> str:
    settings = get_settings()
    root = settings.upload_path / folder
    root.mkdir(parents=True, exist_ok=True)
    suffix = Path(file.filename or "").suffix
    filename = f"{uuid4().hex}{suffix}"
    destination = root / filename
    with destination.open("wb") as out:
        while chunk := file.file.read(1024 * 1024):
            out.write(chunk)
    return f"{settings.public_upload_url_prefix}/{folder}/{filename}"

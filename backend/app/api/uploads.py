from fastapi import APIRouter, Depends, File, UploadFile

from app.api.deps import get_current_user
from app.models.entities import User
from app.services.uploads import save_upload

router = APIRouter(prefix="/uploads", tags=["uploads"])


@router.post("")
def upload_file(
    folder: str = "general",
    file: UploadFile = File(...),
    _: User = Depends(get_current_user),
) -> dict[str, str]:
    return {"url": save_upload(file, folder), "filename": file.filename or "upload"}


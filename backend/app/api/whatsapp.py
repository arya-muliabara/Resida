"""Superadmin WhatsApp gateway configuration and sender discovery."""
import json
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import require_roles
from app.db.session import get_db
from app.models.entities import User, UserRole, WhatsAppGatewayConfig
from app.schemas.users import WhatsAppGatewayConfigRead, WhatsAppGatewayConfigUpdate

router = APIRouter(prefix="/whatsapp-gateway", tags=["whatsapp-gateway"])


def get_config(db: Session) -> WhatsAppGatewayConfig:
    config = db.get(WhatsAppGatewayConfig, 1)
    if not config:
        config = WhatsAppGatewayConfig(id=1)
        db.add(config)
        db.commit()
        db.refresh(config)
    return config


def read_json(url: str, api_key: str) -> object:
    request = Request(url, headers={"Authorization": f"Bearer {api_key}", "Accept": "application/json"})
    with urlopen(request, timeout=8) as response:
        return json.loads(response.read().decode("utf-8"))


@router.get("", response_model=WhatsAppGatewayConfigRead)
def read_config(db: Session = Depends(get_db), _: User = Depends(require_roles(UserRole.superadmin))) -> WhatsAppGatewayConfigRead:
    config = get_config(db)
    return WhatsAppGatewayConfigRead(base_url=config.base_url, sender_id=config.sender_id, is_enabled=config.is_enabled,
                                     configured=bool(config.base_url and config.api_key and config.sender_id))


@router.patch("", response_model=WhatsAppGatewayConfigRead)
def update_config(payload: WhatsAppGatewayConfigUpdate, db: Session = Depends(get_db), _: User = Depends(require_roles(UserRole.superadmin))) -> WhatsAppGatewayConfigRead:
    config = get_config(db)
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(config, key, value.rstrip("/") if key == "base_url" and value else value)
    db.commit()
    db.refresh(config)
    return WhatsAppGatewayConfigRead(base_url=config.base_url, sender_id=config.sender_id, is_enabled=config.is_enabled,
                                     configured=bool(config.base_url and config.api_key and config.sender_id))


@router.get("/senders")
def discover_senders(db: Session = Depends(get_db), _: User = Depends(require_roles(UserRole.superadmin))) -> list[dict]:
    config = get_config(db)
    if not config.base_url or not config.api_key:
        raise HTTPException(status_code=400, detail="Simpan URL gateway dan API key terlebih dahulu")
    try:
        data = read_json(f"{config.base_url}/api/v1/admin/senders", config.api_key)
    except HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Gateway menolak discovery sender (HTTP {exc.code}). Pastikan API key memiliki akses sender.view.") from exc
    except (URLError, TimeoutError, ValueError) as exc:
        raise HTTPException(status_code=502, detail=f"Gateway tidak dapat dihubungi: {exc}") from exc
    rows = data.get("items", data) if isinstance(data, dict) else data
    if not isinstance(rows, list):
        raise HTTPException(status_code=502, detail="Respons sender dari gateway tidak dikenali")
    return [{"id": str(item.get("code") or item.get("sender_id") or item.get("id")), "name": item.get("name") or item.get("phone_number") or item.get("code"), "status": item.get("status")} for item in rows]

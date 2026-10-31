"""E-mail for observer invitations (ADR-0042), over SMTP: implicit TLS (« ssl », port 465) or STARTTLS (port 587).

Planned provider: Resend (smtp.resend.com, user « resend », password = API key). Every setting comes from the
environment (.env, never committed). Errors never reveal the configuration: the caller shows a plain message.
"""

from __future__ import annotations

import smtplib
import ssl
from email.message import EmailMessage
from email.utils import formataddr, make_msgid

from app.config import get_settings

TIMEOUT_SECONDS = 15


class MailError(Exception):
    """Sending failed; the message is safe to show (no host, user or password)."""


def configured() -> bool:
    s = get_settings()
    return bool(s.smtp_host.strip() and s.smtp_port and s.smtp_user.strip() and s.smtp_password and s.smtp_from.strip())


def send(to: str, subject: str, text: str) -> None:
    s = get_settings()
    if not configured():
        raise MailError("L'envoi d'e-mails n'est pas configuré sur le serveur.")
    message = EmailMessage()
    message["From"] = formataddr(("Rapidfox Academy", s.smtp_from.strip()))
    message["To"] = to
    message["Subject"] = subject
    message["Message-ID"] = make_msgid(domain=s.smtp_from.strip().rsplit("@", 1)[-1] or None)
    message.set_content(text)
    context = ssl.create_default_context()
    security = s.smtp_security.strip().lower()
    try:
        if security == "ssl":
            with smtplib.SMTP_SSL(s.smtp_host.strip(), s.smtp_port, timeout=TIMEOUT_SECONDS, context=context) as client:
                client.login(s.smtp_user.strip(), s.smtp_password)
                client.send_message(message)
        else:
            with smtplib.SMTP(s.smtp_host.strip(), s.smtp_port, timeout=TIMEOUT_SECONDS) as client:
                client.starttls(context=context)
                client.login(s.smtp_user.strip(), s.smtp_password)
                client.send_message(message)
    except smtplib.SMTPAuthenticationError as exc:
        raise MailError("Le serveur d'e-mails a refusé l'identification : vérifiez les réglages SMTP du serveur.") from exc
    except smtplib.SMTPRecipientsRefused as exc:
        raise MailError("L'adresse du destinataire a été refusée.") from exc
    except (smtplib.SMTPException, OSError) as exc:
        raise MailError("L'e-mail n'a pas pu être envoyé : le serveur d'e-mails est injoignable ou a refusé l'envoi.") from exc

from __future__ import annotations

import asyncio
import mimetypes
import smtplib
from email.message import EmailMessage
from pathlib import Path
from typing import Iterable

from backend.config import settings


class EmailService:
    """রিপোর্ট ইমেইল করার জন্য minimal SMTP helper."""

    def _recipient_list(self) -> list[str]:
        return [addr.strip() for addr in settings.REPORT_EMAIL_TO.split(",") if addr.strip()]

    async def send_report_email(self, subject: str, body: str, attachment: bytes, filename: str) -> bool:
        recipients = self._recipient_list()
        if not recipients:
            return False

        message = EmailMessage()
        message["From"] = settings.EMAIL_USER
        message["To"] = ", ".join(recipients)
        message["Subject"] = subject
        message.set_content(body)

        mime_type, _ = mimetypes.guess_type(filename)
        if mime_type:
            maintype, subtype = mime_type.split("/", 1)
        else:
            maintype, subtype = "application", "octet-stream"
        message.add_attachment(attachment, maintype=maintype, subtype=subtype, filename=filename)

        def _send() -> None:
            with smtplib.SMTP(settings.EMAIL_HOST, settings.EMAIL_PORT, timeout=20) as server:
                server.starttls()
                if settings.EMAIL_USER and settings.EMAIL_PASS:
                    server.login(settings.EMAIL_USER, settings.EMAIL_PASS)
                server.send_message(message)

        await asyncio.to_thread(_send)
        return True

    async def send_daily_report(self, target_date: str, attachment: bytes, filename: str) -> bool:
        return await self.send_report_email(
            subject=f"Daily Report - {target_date}",
            body=f"Attached is the daily report for {target_date}.",
            attachment=attachment,
            filename=filename,
        )

    async def send_weekly_report(self, week: str, attachment: bytes, filename: str) -> bool:
        return await self.send_report_email(
            subject=f"Weekly Report - {week}",
            body=f"Attached is the weekly report for {week}.",
            attachment=attachment,
            filename=filename,
        )

    async def send_monthly_report(self, month: str, attachment: bytes, filename: str) -> bool:
        return await self.send_report_email(
            subject=f"Monthly Report - {month}",
            body=f"Attached is the monthly report for {month}.",
            attachment=attachment,
            filename=filename,
        )


email_service = EmailService()

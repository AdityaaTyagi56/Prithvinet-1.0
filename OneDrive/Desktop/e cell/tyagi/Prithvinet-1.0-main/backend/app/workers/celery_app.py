from celery import Celery
from celery.schedules import crontab
from app.core.config import settings

celery_app = Celery(
    "prithvinet_worker",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
    include=["app.workers.tasks"]
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
)

celery_app.conf.beat_schedule = {
    "compute-compliance-every-30-mins": {
        "task": "app.workers.tasks.compute_compliance_records",
        "schedule": crontab(minute="*/30"),
    },
    "evaluate-all-readings-every-5-mins": {
        "task": "app.workers.tasks.evaluate_all_readings",
        "schedule": crontab(minute="*/5"),
    },
    "check-missing-reports-daily": {
        "task": "app.workers.tasks.check_missing_reports",
        "schedule": crontab(hour=9, minute=0),
    },
    "refresh-all-forecasts-every-6-hours": {
        "task": "app.workers.tasks.refresh_all_forecasts",
        "schedule": crontab(minute=0, hour="*/6"),
    },
    "daily-aqi-analysis-eod": {
        "task": "app.workers.tasks.run_daily_aqi_analysis",
        "schedule": crontab(hour=23, minute=30),
    },
}

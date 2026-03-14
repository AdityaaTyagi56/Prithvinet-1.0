"""
Capture PrithviNet UI screenshots for the submission README.
Requires: pip install playwright && playwright install chromium

Usage:
  1. Start the dev server: npm run dev
  2. Run: python scripts/capture_screenshots.py

Outputs: docs/screenshots/01_public_portal.png ... 08_copilot.png
"""

import asyncio
import os
from pathlib import Path

try:
    from playwright.async_api import async_playwright, Page
except ImportError:
    raise SystemExit(
        "Playwright not installed.\n"
        "Run: pip install playwright && playwright install chromium"
    )

BASE_URL = os.getenv("PRITHVINET_URL", "http://localhost:3000")
OUT_DIR = Path(__file__).resolve().parents[1] / "docs" / "screenshots"
VIEWPORT = {"width": 1280, "height": 720}

# Demo credentials (must match seed data)
OFFICER_EMAIL = "officer@cecb.gov.in"
OFFICER_PASS = "officer@2024"
ADMIN_EMAIL = "admin@cecb.gov.in"
ADMIN_PASS = "cecb@2024"


async def wait_and_snap(page: Page, path: str, label: str) -> None:
    await page.wait_for_load_state("networkidle")
    await page.wait_for_timeout(1500)  # let charts render
    await page.screenshot(path=path, full_page=False)
    print(f"  ✓ {label} → {Path(path).name}")


async def login(page: Page, email: str, password: str) -> None:
    await page.goto(f"{BASE_URL}/login")
    await page.wait_for_load_state("networkidle")
    await page.fill("input[type='email'], input[name='email'], input[placeholder*='email' i]", email)
    await page.fill("input[type='password']", password)
    await page.click("button[type='submit']")
    await page.wait_for_load_state("networkidle")
    await page.wait_for_timeout(1000)


async def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    print(f"Capturing screenshots from {BASE_URL}")
    print(f"Output directory: {OUT_DIR}\n")

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(viewport=VIEWPORT)
        page = await context.new_page()

        # ── 01 Public Portal ─────────────────────────────────────────────────
        print("01 Public Portal")
        await page.goto(f"{BASE_URL}/public")
        await wait_and_snap(page, str(OUT_DIR / "01_public_portal.png"), "Public Portal")

        # ── 02 Login Page ─────────────────────────────────────────────────────
        print("02 Login")
        await page.goto(f"{BASE_URL}/login")
        await page.wait_for_load_state("networkidle")
        await page.wait_for_timeout(800)
        await page.screenshot(path=str(OUT_DIR / "02_login.png"), full_page=False)
        print("  ✓ Login → 02_login.png")

        # ── Login as Regional Officer ─────────────────────────────────────────
        await login(page, OFFICER_EMAIL, OFFICER_PASS)

        # ── 03 Unified Dashboard ──────────────────────────────────────────────
        print("03 Dashboard")
        await page.goto(f"{BASE_URL}/dashboard")
        await wait_and_snap(page, str(OUT_DIR / "03_dashboard.png"), "Unified Dashboard")

        # ── 04 Pollution Map ──────────────────────────────────────────────────
        print("04 Map")
        # Click the map tab/nav if it exists
        map_tab = page.locator("text=Map, text=Heatmap, [href*='map']").first
        try:
            await map_tab.click(timeout=3000)
        except Exception:
            await page.goto(f"{BASE_URL}/dashboard")
        await wait_and_snap(page, str(OUT_DIR / "04_map.png"), "Pollution Map")

        # ── 05 Forecast ───────────────────────────────────────────────────────
        print("05 Forecast")
        forecast_tab = page.locator("text=Forecast, text=Predict, [href*='forecast']").first
        try:
            await forecast_tab.click(timeout=3000)
        except Exception:
            pass
        await wait_and_snap(page, str(OUT_DIR / "05_forecast.png"), "Forecast Chart")

        # ── 06 Alerts ─────────────────────────────────────────────────────────
        print("06 Alerts")
        alerts_tab = page.locator("text=Alerts, [href*='alert']").first
        try:
            await alerts_tab.click(timeout=3000)
        except Exception:
            pass
        # Wait up to 5 s for an alert card to appear
        await page.wait_for_timeout(3500)
        await page.screenshot(path=str(OUT_DIR / "06_alerts.png"), full_page=False)
        print("  ✓ Alerts → 06_alerts.png")

        await context.close()

        # ── Login as Admin ────────────────────────────────────────────────────
        context = await browser.new_context(viewport=VIEWPORT)
        page = await context.new_page()
        await login(page, ADMIN_EMAIL, ADMIN_PASS)

        # ── 07 Compliance Dashboard ───────────────────────────────────────────
        print("07 Compliance")
        compliance_tab = page.locator("text=Compliance, [href*='compliance']").first
        try:
            await compliance_tab.click(timeout=3000)
        except Exception:
            await page.goto(f"{BASE_URL}/dashboard")
        await wait_and_snap(page, str(OUT_DIR / "07_compliance.png"), "Compliance Dashboard")

        # ── 08 AI CoPilot ─────────────────────────────────────────────────────
        print("08 AI CoPilot")
        copilot_tab = page.locator("text=CoPilot, text=Copilot, text=AI, [href*='copilot']").first
        try:
            await copilot_tab.click(timeout=3000)
            # Type a demo query
            input_box = page.locator("textarea, input[type='text']").last
            await input_box.fill("What are the current PM2.5 levels in Korba?")
            await input_box.press("Enter")
            await page.wait_for_timeout(4000)  # wait for AI response
        except Exception:
            pass
        await page.screenshot(path=str(OUT_DIR / "08_copilot.png"), full_page=False)
        print("  ✓ AI CoPilot → 08_copilot.png")

        await context.close()
        await browser.close()

    print(f"\nDone. {len(list(OUT_DIR.glob('*.png')))} screenshots saved to {OUT_DIR}")


if __name__ == "__main__":
    asyncio.run(main())

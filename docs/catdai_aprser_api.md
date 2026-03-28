# Prices API

## Auth

All requests require `Authorization: Bearer <API_TOKEN>` header.

## `GET /api/prices/latest`

Returns current median prices for Chișinău.

```bash
curl -H "Authorization: Bearer YOUR_TOKEN" http://localhost:3100/api/prices/latest
```

**Response:**
```json
{
  "constructii_noi": { "median_ppm": 850 },
  "secundar": { "median_ppm": 680 },
  "trend": { "change_percent": 1.2, "direction": "up" },
  "total_active": 16000,
  "updated_at": "2026-03-28T08:30:00.000Z"
}

```

- `direction`: `"up"`, `"down"`, or `"stable"`
- `updated_at`: timestamp of last data refresh (after daily Telegram cron)
- On first request before any cron run, data is loaded once from Supabase

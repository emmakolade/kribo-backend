# Kribo API Endpoint Reference

This document reflects the currently implemented REST endpoints in the backend.

## Quick Endpoint Table

| Method | Path                                            | Auth | Role                        |
| ------ | ----------------------------------------------- | ---- | --------------------------- |
| GET    | /health                                         | No   | Public                      |
| POST   | /auth/register                                  | No   | Public                      |
| POST   | /auth/login                                     | No   | Public                      |
| POST   | /auth/send-email-otp                            | No   | Public                      |
| POST   | /auth/verify-email-otp                          | No   | Public                      |
| POST   | /auth/forgot-password/request                   | No   | Public                      |
| POST   | /auth/forgot-password/reset                     | No   | Public                      |
| POST   | /auth/logout                                    | Yes  | Any                         |
| GET    | /auth/me                                        | Yes  | Any                         |
| GET    | /auth/profile                                   | Yes  | Any                         |
| PATCH  | /auth/profile                                   | Yes  | Any                         |
| POST   | /auth/change-password                           | Yes  | Any                         |
| POST   | /auth/verify-host                               | Yes  | Any                         |
| POST   | /auth/onboarding/host/business-contact          | Yes  | host                        |
| POST   | /auth/onboarding/host/manager                   | Yes  | host                        |
| GET    | /auth/onboarding/host/banks                     | Yes  | host                        |
| POST   | /auth/onboarding/host/bank-account/resolve-name | Yes  | host                        |
| POST   | /auth/onboarding/host/bank-account              | Yes  | host                        |
| GET    | /auth/onboarding/host/service-agreement-text    | Yes  | host                        |
| POST   | /auth/onboarding/host/service-agreement         | Yes  | host                        |
| POST   | /auth/onboarding/host/activate-business         | Yes  | host                        |
| POST   | /auth/onboarding/guest/profile                  | Yes  | guest                       |
| POST   | /uploads/photos                                 | Yes  | guest/host/admin            |
| GET    | /properties                                     | No   | Public                      |
| GET    | /properties/search                              | No   | Public                      |
| GET    | /properties/:id                                 | No   | Public                      |
| GET    | /properties/host/me                             | Yes  | host                        |
| POST   | /properties                                     | Yes  | host                        |
| PATCH  | /properties/:id                                 | Yes  | host                        |
| POST   | /properties/:id/availability                    | Yes  | host                        |
| POST   | /units                                          | Yes  | host                        |
| GET    | /units/property/:propertyId                     | Yes  | host                        |
| GET    | /units/:id                                      | Yes  | host                        |
| PATCH  | /units/:id                                      | Yes  | host                        |
| DELETE | /units/:id                                      | Yes  | host                        |
| DELETE | /units/property/:propertyId                     | Yes  | host                        |
| POST   | /bookings                                       | Yes  | guest                       |
| POST   | /bookings/:id/confirm-payment                   | Yes  | guest/admin                 |
| GET    | /bookings                                       | Yes  | Any                         |
| GET    | /bookings/stats                                 | Yes  | host/admin                  |
| GET    | /bookings/:id                                   | Yes  | Any                         |
| GET    | /bookings/:id/status                            | Yes  | Any                         |
| GET    | /host/:id/earnings                              | Yes  | host/admin                  |
| POST   | /bookings/:id/action                            | Yes  | host/admin                  |
| POST   | /host/bookings/:id/withdraw                     | Yes  | host/admin                  |
| POST   | /webhooks/whatsapp                              | No*  | Public (signature verified) |
| POST   | /webhooks/paystack                              | No*  | Public (signature verified) |
| GET    | /admin/bookings                                 | Yes  | admin                       |
| POST   | /admin/bookings/:id/force-accept                | Yes  | admin                       |
| POST   | /admin/bookings/:id/force-decline               | Yes  | admin                       |
| GET    | /admin/disputes                                 | Yes  | admin                       |
| POST   | /admin/disputes/:id/resolve                     | Yes  | admin                       |
| GET    | /admin/hosts                                    | Yes  | admin                       |
| GET    | /admin/host/:id/earnings                        | Yes  | admin                       |
| GET    | /docs                                           | No   | Public                      |

## Base URL

- Local: `http://localhost:4000`

## Authentication

- Protected endpoints require `Authorization: Bearer <jwt>`.
- Roles used by guards: `guest`, `host`, `admin`.

## Error Shape

```json
{
  "error": {
    "code": "STRING_CODE",
    "message": "Human readable message"
  }
}
```

---

## Health

### GET /health

- Auth: none
- Response 200:

```json
{
  "ok": true
}
```

---

## Auth Endpoints

### POST /auth/register

- Auth: none
- Prerequisite: verify register OTP first (`/auth/send-email-otp`, `/auth/verify-email-otp`).
- Body:

```json
{
  "firstName": "Jane",
  "lastName": "Doe",
  "email": "jane@example.com",
  "password": "strongpassword",
  "role": "guest"
}
```

Host register body uses the same fields with `"role": "host"`.

- Validation:
  - `firstName` min length 2
  - `lastName` min length 2
  - `email` valid email
  - `password` min length 8
  - `role` required: `guest | host`
- Response 201:

```json
{
  "accessToken": "jwt-access-token",
  "refreshToken": "jwt-refresh-token"
}
```

### POST /auth/login

- Auth: none
- Body:

```json
{
  "email": "jane@example.com",
  "password": "strongpassword"
}
```

- Response 200:

```json
{
  "accessToken": "jwt-access-token",
  "refreshToken": "jwt-refresh-token"
}
```

### POST /auth/send-email-otp

- Auth: none
- Body:

```json
{
  "email": "jane@example.com",
  "purpose": "register"
}
```

- `purpose`: `register | login | forgot_password`
- Response 200:

```json
{
  "ok": true,
  "expiresInSeconds": 600
}
```

### POST /auth/verify-email-otp

- Auth: none
- Body:

```json
{
  "email": "jane@example.com",
  "purpose": "register",
  "otp": "123456"
}
```

- Response 200:

```json
{
  "ok": true
}
```

### POST /auth/forgot-password/request

- Auth: none
- Body:

```json
{
  "email": "jane@example.com"
}
```

- Response 200:

```json
{
  "ok": true,
  "expiresInSeconds": 600
}
```

### POST /auth/forgot-password/reset

- Auth: none
- Body:

```json
{
  "email": "jane@example.com",
  "otp": "123456",
  "newPassword": "newStrongPassword",
  "confirmPassword": "newStrongPassword"
}
```

### GET /auth/me

- Auth: required
- Response 200:

```json
{
  "user": {
    "id": "688...",
    "role": "host",
    "firstName": "Jane",
    "lastName": "Doe",
    "email": "jane@example.com",
    "phoneNumber": "+2348012345678"
  },
  "hostOnboarding": {
    "propertyName": "Harborlight Suites",
    "propertyType": "hotel",
    "status": {

  ### POST /auth/logout

  - Auth: required
  - Body: none
  - Response 200:

  ```json
  {
    "ok": true
  }
  ```
      "completed": false,
      "details": {
        "businessPhoneNumber": "+2348012345678",
        "trustedWhatsappNumber": "+2348098765432",
        "officeAddress": "12 Admiralty Way, Lekki",
        "officeLga": "Eti-Osa",
        "officeState": "Lagos",
        "website": "https://example.com",
        "managerName": "John Manager",
        "dateOfBirth": "1990-06-15",
        "nationality": "Nigerian",
        "ninNumber": "12345678901",
        "managerHomeAddress": "7 Allen Avenue, Ikeja",
        "accountNumber": "0123456789",
        "bankCode": "999992",
        "accountName": "JOHN DOE",
        "serviceAgreementAccepted": false
      }
    }
  },
  "guestOnboarding": {
    "status": {
      "completed": false,
      "details": {
        "phoneNumber": "+2348012345678",
        "isWhatsappNumber": true,
        "whatsappNumber": "+2348012345678",
        "ninNumber": "12345678901"
      }
    }
  }
}
```

- Validation:
  - `otp` must be a 6-digit string
  - `newPassword` min length 8
  - `confirmPassword` min length 8 and must match `newPassword`
- Response 200:

```json
{
  "accessToken": "jwt-access-token",
  "refreshToken": "jwt-refresh-token"
}
```

### GET /auth/profile

- Auth: required
- Response 200:

```json
{
  "id": "688...",
  "role": "guest",
  "firstName": "Jane",
  "lastName": "Doe",
  "email": "jane@example.com",
  "phoneNumber": "+2348012345678"
}
```

### PATCH /auth/profile

- Auth: required
- Body:

```json
{
  "firstName": "Jane",
  "lastName": "Doe",
  "phoneNumber": "+2348012345678"
}
```

- Response 200: same as `GET /auth/profile`.

### POST /auth/change-password

- Auth: required
- Body:

```json
{
  "currentPassword": "oldStrongPassword",
  "newPassword": "newStrongPassword",
  "confirmPassword": "newStrongPassword"
}
```

- Response 200:

```json
{
  "ok": true
}
```

### POST /auth/verify-host

- Auth: required
- Body:

```json
{
  "bvn": "12345678901",
  "idDocumentUrl": "https://res.cloudinary.com/your-cloud/image/upload/v123/id.png"
}
```

- Response 200:

```json
{
  "ok": true
}
```

### Host Onboarding / Compliance

All endpoints below require auth and are host-only.

#### POST /auth/onboarding/host/business-contact

```json
{
  "businessPhoneNumber": "+2348012345678",
  "trustedWhatsappNumber": "+2348098765432",
  "officeAddress": "12 Admiralty Way, Lekki",
  "officeLga": "Eti-Osa",
  "officeState": "Lagos",
  "website": "https://example.com"
}
```

- Response 200:

```json
{
  "ok": true,
  "step": "business_contact"
}
```

#### POST /auth/onboarding/host/manager

```json
{
  "managerName": "John Manager",
  "dateOfBirth": "1990-06-15",
  "nationality": "Nigerian",
  "ninNumber": "12345678901",
  "ninDocumentUrl": "https://res.cloudinary.com/your-cloud/image/upload/v123/nin.jpg",
  "managerHomeAddress": "7 Allen Avenue, Ikeja",
  "proofOfAddressUrl": "https://res.cloudinary.com/your-cloud/image/upload/v123/proof.jpg"
}
```

- Response 200:

```json
{
  "ok": true,
  "step": "manager"
}
```

#### GET /auth/onboarding/host/banks

- Response 200:

```json
{
  "ok": true,
  "data": [
    {
      "name": "OPay Digital Services Limited",
      "code": "999992"
    },
    {
      "name": "Guaranty Trust Bank",
      "code": "058"
    }
  ]
}
```

#### POST /auth/onboarding/host/bank-account

```json
{
  "accountNumber": "0123456789",
  "bankCode": "058",
  "accountName": "JOHN DOE"
}
```

- Response 200:

```json
{
  "ok": true,
  "step": "bank_account"
}
```

#### POST /auth/onboarding/host/bank-account/resolve-name

```json
{
  "accountNumber": "0123456789",
  "bankCode": "058"
}
```

- Response 200:

```json
{
  "ok": true,
  "data": {
    "accountNumber": "0123456789",
    "accountName": "JOHN DOE",
    "bankCode": "058"
  }
}
```

#### GET /auth/onboarding/host/service-agreement-text

- Response 200:

```json
{
  "version": "v1",
  "text": "By using Kribo as a host ..."
}
```

#### POST /auth/onboarding/host/service-agreement

```json
{
  "accepted": true
}
```

- Response 200:

```json
{
  "ok": true,
  "step": "service_agreement"
}
```

#### POST /auth/onboarding/host/activate-business

- Body: none
- Response 200:

```json
{
  "ok": true,
  "status": "business_activated"
}
```

### Guest Post-Signup Step

#### POST /auth/onboarding/guest/profile

- Auth: required, guest-only
- Body:

```json
{
  "phoneNumber": "+2348012345678",
  "isWhatsappNumber": false,
  "whatsappNumber": "+2348098765432",
  "ninNumber": "12345678901",
  "ninDocumentUrl": "https://res.cloudinary.com/your-cloud/image/
  upload/v123/nin.jpg"
}
```

- Note: `whatsappNumber` is required when `isWhatsappNumber` is `false`.
- Response 200:

```json
{
  "ok": true,
  "step": "guest_profile"
}
```

## Upload Endpoints

### POST /uploads/photos

- Auth: required (`guest | host | admin`)
- Content-Type: `multipart/form-data`
- Form field: `photos`
- Limits:
  - max 10 files
  - max 10MB per file
  - image files and PDF files
- Response 201:

```json
{
  "urls": [
    "https://res.cloudinary.com/your-cloud/image/upload/v123/kribo/photos/photo1.jpg",
    "https://res.cloudinary.com/your-cloud/image/upload/v123/kribo/photos/photo2.jpg"
  ]
}
```

---

## Property Endpoints

### GET /properties

- Auth: none
- Query params (all optional):
  - `location`
  - `guests`
  - `priceMin`
  - `priceMax`
  - `propertyType` (`hotel | shortlet`)
  - `amenities` (comma-separated string or repeated query param)
- Response 200: array of property API views.

### GET /properties/search

- Auth: none
- Query params:
  - `checkIn` required
  - `checkOut` required
  - `guests` optional
  - `priceMin` optional
  - `priceMax` optional
  - `type` optional (`hotel | shortlet`)
- Response 200: available properties with filtered units.

### GET /properties/:id

- Auth: none
- Response 200: property API view (includes `roomOptions`, amenities, fees, etc).

### GET /properties/host/me

- Auth: required, role `host`
- Response 200:

```json
{
  "property": {
    "id": "688...",
    "name": "Lekki Lagoon Suites",
    "city": "Lagos",
    "area": "Lekki",
    "propertyType": "shortlet",
    "roomType": "Deluxe",
    "maxGuests": 2,
    "nightlyRate": 75000,
    "roomOptions": [],
    "rating": 0,
    "reviewCount": 0,
    "verified": false,
    "images": [],
    "amenities": [],
    "description": "Modern shortlet in Lekki",
    "cancellationPolicy": ""
  }
}
```

- If the host has no property yet, returns:

```json
{
  "property": null
}
```

### POST /properties

- Auth: required, role `host`
- Body:

```json
{
  "name": "Lekki Lagoon Suites",
  "description": "Modern shortlet in Lekki Phase 1",
  "city": "Lagos",
  "area": "Lekki Phase 1",
  "fullAddress": "Lekki, Lagos",
  "coordinates": [3.4906, 6.4474],
  "amenities": ["wifi", "swimming_pool"],
  "photos": [
    "https://res.cloudinary.com/your-cloud/image/upload/v123/kribo/photos/p1.jpg",
    "https://res.cloudinary.com/your-cloud/image/upload/v123/kribo/photos/p2.jpg"
  ],
  "propertyType": "shortlet"
}
```

- Notes:
  - `photos` minimum is 2.
  - `propertyType` is optional in request but required to resolve at service level.
- Response 201:

```json
{
  "propertyId": "688..."
}
```

### PATCH /properties/:id

- Auth: required, role `host`
- Body: flexible partial object of updatable fields.
- Response 200:

```json
{
  "ok": true
}
```

### POST /properties/:id/availability

- Auth: required, role `host`
- Body:

```json
{
  "unitId": "688...",
  "date": "2026-08-01T00:00:00.000Z",
  "status": "blocked"
}
```

- `status`: `open | blocked`
- Response 200:

```json
{
  "ok": true
}
```

---

## Unit Endpoints

All unit endpoints require auth and role `host`.

### POST /units

- Body:

```json
{
  "propertyId": "688...",
  "name": "Entire 1-bedroom",
  "maxGuests": 2,
  "pricePerNight": 75000,
  "photos": [
    "https://res.cloudinary.com/your-cloud/image/upload/v123/kribo/photos/u1.jpg",
    "https://res.cloudinary.com/your-cloud/image/upload/v123/kribo/photos/u2.jpg",
    "https://res.cloudinary.com/your-cloud/image/upload/v123/kribo/photos/u3.jpg"
  ],
  "isAvailable": true
}
```

- Notes:
  - `photos` minimum is 3.
- Response 201:

```json
{
  "unitId": "688..."
}
```

### GET /units/property/:propertyId

- Response 200: array of units for the property.

### GET /units/:id

- Response 200: single unit.

### PATCH /units/:id

- Body: any subset of `name`, `maxGuests`, `pricePerNight`, `photos`, `isAvailable`.
- Response 200:

```json
{
  "ok": true
}
```

### DELETE /units/:id

- Response 200:

```json
{
  "ok": true
}
```

### DELETE /units/property/:propertyId

- Response 200:

```json
{
  "deletedCount": 2
}
```

---

## Booking Endpoints

### POST /bookings

- Auth: required, role `guest`
- Body:

```json
{
  "unitId": "688...",
  "checkIn": "2026-08-01",
  "checkOut": "2026-08-03"
}
```

Alternative property-first body:

```json
{
  "propertyId": "688...",
  "checkIn": "2026-08-01",
  "checkOut": "2026-08-03",
  "roomType": "Entire 1-bedroom",
  "nightlyRate": 75000
}
```

- Validation note: either `unitId` or `propertyId` is required.
- Response 201:
  - both unit-first and property-first flows return:

```json
{
  "bookingId": "688...",
  "status": "pending",
  "paystackReference": "psk_ref_...",
  "paystackCheckoutUrl": "https://checkout.paystack.com/..."
}
```

- Payment flow note:
  - Open `paystackCheckoutUrl` in the client to complete payment authorization.
  - After checkout, call `POST /bookings/:id/confirm-payment` to verify and move booking to `payment_held`.

### POST /bookings/:id/confirm-payment

- Auth: required (`guest` owner or `admin`)
- Body: none
- Behavior: verifies Paystack transaction status and transitions booking to `payment_held` when successful.
- Response 200:

```json
{
  "bookingId": "688...",
  "status": "payment_held"
}
```

### GET /bookings

- Auth: required
- Returns role-filtered bookings:
  - guest: own bookings
  - host: bookings for host properties
  - admin: all bookings

### GET /bookings/stats

- Auth: required, role `host | admin`
- Response 200:

```json
{
  "totalPendingBookings": 0,
  "totalConfirmedBookings": 0,
  "totalCheckedInBookings": 0
}
```

### GET /bookings/:id

- Auth: required
- Response 200: booking API view.

### GET /bookings/:id/status

- Auth: required
- Response 200:

```json
{
  "bookingId": "688...",
  "status": "payment_held",
  "ttlSeconds": 534
}
```

---

## Host Endpoints

### GET /host/:id/earnings

- Auth: required, role `host | admin`
- Response 200: host earnings summary.

### POST /bookings/:id/action

- Auth: required, role `host | admin`
- Body:

```json
{
  "action": "accept"
}
```

- [ ] `action`: `accept | decline | check-in`
- [ ] Response 200:

```json
{
  "bookingId": "688...",
  "status": "confirmed",
  "ttlSeconds": 0
}
```

### POST /host/bookings/:id/withdraw

- Auth: required, role `host | admin`
- Response 200:

```json
{
  "bookingId": "688...",
  "status": "paid_out",
  "ttlSeconds": 0
}
```

---

## Webhook Endpoints

### POST /webhooks/whatsapp

- Auth: none (signature-verified in controller)
- Required header:
  - `x-twilio-signature`
- Body format A:

```json
{
  "bookingId": "688...",
  "decision": "accept",
  "webhookId": "twilio-message-id-123"
}
```

### POST /webhooks/paystack

- Auth: none
- Signature: `x-paystack-signature` validated with your Paystack secret key against raw request body.
- Purpose: automatically confirms a booking payment when a `charge.success` event with `data.status=success` is received for a booking's `paystackReference`.
- Dashboard setup: set your Paystack webhook URL to your public backend URL + `/webhooks/paystack` (for example: `https://api.kribo.com/webhooks/paystack`).
- Notes:
  - This endpoint is idempotent using Paystack event id.
  - Non-payment events are safely acknowledged and ignored.
  - Returns `200` for accepted/ignored events so Paystack does not keep retrying handled callbacks.

- Body format B (Twilio-style payload):

```json
{
  "Body": "ACCEPT 688abc123",
  "MessageSid": "SM123"
}
```

- Response 200:

```json
{
  "status": "confirmed"
}
```

---

## Admin Endpoints

All admin endpoints require auth and role `admin`.

### GET /admin/bookings

- Query:
  - `status` optional (defaults to escalated in controller)
- Response 200: booking rows matching status.

### POST /admin/bookings/:id/force-accept

- Response 200:

```json
{
  "status": "confirmed"
}
```

### POST /admin/bookings/:id/force-decline

- Response 200:

```json
{
  "status": "declined"
}
```

### GET /admin/disputes

- Response 200: list of disputes.

### POST /admin/disputes/:id/resolve

- Body:

```json
{
  "resolutionNotes": "Resolved after verification"
}
```

- Response 200:

```json
{
  "ok": true
}
```

### GET /admin/hosts

- Response 200: list of unverified hosts.

### GET /admin/host/:id/earnings

- Response 200: host earnings summary.

---

## Docs Endpoint

### GET /docs

- Auth: none
- Response: Swagger UI page.

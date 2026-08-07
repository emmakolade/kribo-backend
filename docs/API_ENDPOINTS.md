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
| GET    | /properties/host/availability                   | Yes  | host                        |
| POST   | /properties                                     | Yes  | host                        |
| PATCH  | /properties/:id                                 | Yes  | host                        |
| PATCH  | /properties/:id/booking-availability            | Yes  | host                        |
| POST   | /properties/:id/availability                    | Yes  | host                        |
| POST   | /units                                          | Yes  | host                        |
| GET    | /units/property/:propertyId                     | Yes  | host                        |
| GET    | /units/:id                                      | Yes  | host                        |
| PATCH  | /units/:id                                      | Yes  | host                        |
| PATCH  | /units/:id/availability                         | Yes  | host                        |
| DELETE | /units/:id                                      | Yes  | host                        |
| DELETE | /units/property/:propertyId                     | Yes  | host                        |
| POST   | /bookings                                       | Yes  | guest                       |
| POST   | /payments/initialize                            | Yes  | guest/admin                 |
| GET    | /payments/:reference/callback-status            | No   | Public                      |
| GET    | /payments/:reference/status                     | Yes  | guest/admin                 |
| GET    | /bookings                                       | Yes  | Any                         |
| GET    | /bookings/stats                                 | Yes  | host/admin                  |
| GET    | /bookings/:id                                   | Yes  | Any                         |
| GET    | /bookings/:id/status                            | Yes  | Any                         |
| GET    | /host/:id/earnings                              | Yes  | host/admin                  |
| POST   | /bookings/:id/action                            | Yes  | host/admin                  |
| POST   | /host/bookings/:id/withdraw                     | Yes  | host/admin                  |
| POST   | /webhooks/whatsapp                              | No*  | Public (signature verified) |
| POST   | /webhooks/paystack                              | No*  | Public (signature verified) |
| GET    | /admin/overview                                 | Yes  | admin                       |
| GET    | /admin/users                                    | Yes  | admin                       |
| PATCH  | /admin/users/:id                                | Yes  | admin                       |
| POST   | /admin/users/:id/suspend                        | Yes  | admin                       |
| POST   | /admin/users/:id/restore                        | Yes  | admin                       |
| GET    | /admin/properties                               | Yes  | admin                       |
| PATCH  | /admin/properties/:id                           | Yes  | admin                       |
| GET    | /admin/units                                    | Yes  | admin                       |
| PATCH  | /admin/units/:id                                | Yes  | admin                       |
| GET    | /admin/bookings                                 | Yes  | admin                       |
| GET    | /admin/bookings/all                             | Yes  | admin                       |
| PATCH  | /admin/bookings/:id/status                      | Yes  | admin                       |
| POST   | /admin/bookings/:id/force-accept                | Yes  | admin                       |
| POST   | /admin/bookings/:id/force-decline               | Yes  | admin                       |
| GET    | /admin/payouts                                  | Yes  | admin                       |
| POST   | /admin/payouts/:id/mark-paid-out                | Yes  | admin                       |
| GET    | /admin/payments                                 | Yes  | admin                       |
| GET    | /admin/disputes                                 | Yes  | admin                       |
| GET    | /admin/disputes/all                             | Yes  | admin                       |
| POST   | /admin/disputes/:id/resolve                     | Yes  | admin                       |
| GET    | /admin/audit-logs                               | Yes  | admin                       |
| GET    | /admin/onboarding/reviews                       | Yes  | admin                       |
| POST   | /admin/onboarding/reviews/:id/decision          | Yes  | admin                       |
| GET    | /admin/profile-change-requests                  | Yes  | admin                       |
| POST   | /admin/profile-change-requests/:id/decision     | Yes  | admin                       |
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
    "phoneNumber": "+2348012345678",
    "phoneCountryIso": "NG",
    "phoneCountryDialCode": "+234"
  },
  "hostOnboarding": {
    "propertyName": "Harborlight Suites",
    "propertyType": "hotel",
    "status": {
      "completed": false,
      "approvalStatus": "pending",
      "details": {
        "businessPhoneNumber": "+2348012345678",
        "businessPhoneCountryIso": "NG",
        "businessPhoneCountryDialCode": "+234",
        "trustedWhatsappNumber": "+2348098765432",
        "trustedWhatsappCountryIso": "NG",
        "trustedWhatsappCountryDialCode": "+234",
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
        "bankName": "OPay Digital Services Limited",
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
        "phoneCountryIso": "NG",
        "phoneCountryDialCode": "+234",
        "isWhatsappNumber": true,
        "whatsappNumber": "+2348012345678",
        "whatsappCountryIso": "NG",
        "whatsappCountryDialCode": "+234",
        "ninNumber": "12345678901"
      }
    }
  }
}

```

### POST /auth/logout

- Auth: required
- Body: none
- Response 200:

```json
{
  "ok": true
}
```

### GET /auth/profile

- Auth: required
- Response 200:

```json
{
  "id": "688...",
  "role": "host",
  "firstName": "Jane",
  "lastName": "Doe",
  "email": "jane@example.com",
  "phoneNumber": "+2348012345678",
  "phoneCountryIso": "NG",
  "phoneCountryDialCode": "+234",
  "bankDetails": {
    "bankName": "Guaranty Trust Bank",
    "accountNumber": "0123456789",
    "accountName": "JOHN DOE",
    "editable": false
  }
}
```

### PATCH /auth/profile

- Auth: required
- Body:

```json
{
  "firstName": "Jane",
  "lastName": "Doe",
  "phoneNumber": "08123456789",
  "phoneCountryIso": "NG"
}
```

- `phoneNumber` is submitted as local/national format alongside `phoneCountryIso` and saved in E.164 format.
- Host bank details are returned as read-only under `bankDetails` (`editable: false`).
- Use host onboarding bank account endpoint to set/update payout bank details.
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
  "businessPhoneNumber": "08123456789",
  "businessPhoneCountryIso": "NG",
  "trustedWhatsappNumber": "08109876543",
  "trustedWhatsappCountryIso": "NG",
  "officeAddress": "12 Admiralty Way, Lekki",
  "officeLga": "Eti-Osa",
  "officeState": "Lagos",
  "website": "https://example.com"
}
```

- `businessPhoneNumber` and `trustedWhatsappNumber` are normalized and persisted in E.164 format.
- If business contact has already been completed before, this endpoint creates a pending profile-change request with old/new values for admin approval instead of replacing active data immediately.

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

- If manager onboarding has already been completed before, this endpoint creates a pending profile-change request with old/new values for admin approval instead of replacing active data immediately.

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

- Behavior: once a host account number has been saved, subsequent account-number changes are blocked here and must be handled by support.

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
  "status": "submitted_for_review"
}
```

- Behavior:
  - When submission succeeds, host onboarding is locked for admin review until an approval decision is made.
  - The system sends an email notification to configured admin recipients (`ADMIN_EMAILS`) so onboarding can be approved or rejected from admin dashboard.

### Guest Post-Signup Step

#### POST /auth/onboarding/guest/profile

- Auth: required, guest-only
- Body:

```json
{
  "phoneNumber": "08123456789",
  "phoneCountryIso": "NG",
  "isWhatsappNumber": false,
  "whatsappNumber": "08109876543",
  "whatsappCountryIso": "NG",
  "ninNumber": "12345678901",
  "ninDocumentUrl": "https://res.cloudinary.com/your-cloud/image/
  upload/v123/nin.jpg"
}
```

- Note: `whatsappNumber` and `whatsappCountryIso` are required when `isWhatsappNumber` is `false`.
- All submitted phone numbers are normalized and stored in E.164 format.
- If guest profile has already been completed before, this endpoint creates a pending profile-change request with old/new values for admin approval instead of replacing active data immediately.
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
    "bookingEnabled": true,
    "hasAvailableRooms": true,
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
  "ok": true,
  "status": "pending_admin_review"
}
```

- Behavior:
  - For host edits, changed property fields are saved as a pending `host_property` profile change request with `oldValue` and `newValue`.
  - Active property values are applied after admin approval of that request.

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

### GET /properties/host/availability

- Auth: required, role `host`
- Response 200:

```json
{
  "properties": [
    {
      "propertyId": "688...",
      "propertyName": "Lekki Lagoon Suites",
      "bookingEnabled": true
    }
  ]
}
```

### PATCH /properties/:id/booking-availability

- Auth: required, role `host`
- Body:

```json
{
  "bookingEnabled": false
}
```

- Response 200:

```json
{
  "propertyId": "688...",
  "bookingEnabled": false
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

### PATCH /units/:id/availability

- Body:

```json
{
  "isAvailable": false
}
```

- Response 200:

```json
{
  "unitId": "688...",
  "isAvailable": false
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
  "status": "pending"
}
```

- Payment flow note:
  - Booking creation only creates a pending booking draft.
  - Initialize checkout using `POST /payments/initialize`.
  - Redirect the user to the returned `checkoutUrl`.
  - Backend webhooks and verification determine final payment status.
  - Once payment is successful, booking transitions to `confirmed` and host notification events are emitted.

### POST /payments/initialize

- Auth: required (`guest` owner or `admin`)
- Body:

```json
{
  "bookingId": "688...",
  "email": "guest@example.com"
}
```

- Behavior:
  - validates booking ownership and pending state;
  - initializes Paystack checkout with a unique backend reference;
  - stores a pending payment record for webhook/idempotent processing.
- Response 200:

```json
{
  "bookingId": "688...",
  "paymentReference": "kribo_pay_...",
  "status": "pending",
  "checkoutUrl": "https://checkout.paystack.com/..."
}
```

### GET /payments/:reference/status

- Auth: required (`guest` owner or `admin`)
- Behavior:
  - returns canonical backend payment state;
  - if payment is still pending, backend verifies with Paystack before responding;
  - returns booking status alongside payment status.
- Response 200:

```json
{
  "bookingId": "688...",
  "paymentReference": "kribo_pay_...",
  "paymentStatus": "pending",
  "bookingStatus": "pending"
}
```

### GET /payments/:reference/callback-status

- Auth: none
- Purpose:
  - supports payment callback pages without forcing sign-in;
  - returns canonical payment and booking status using only the payment reference;
  - when payment is still pending, backend verifies with Paystack before responding.
- Response 200:

```json
{
  "bookingId": "688...",
  "paymentReference": "kribo_pay_...",
  "paymentStatus": "pending",
  "bookingStatus": "pending"
}
```

### GET /bookings

- Auth: required
- Returns role-filtered bookings:
  - guest: own bookings
  - host: bookings for host properties
  - admin: all bookings
- Each booking item may include:
  - `payoutAmount`: host payout amount (excludes service fee)
- Each booking item may include:
  - `checkedInAt`: ISO timestamp for when host marked check-in
  - `paidOutAt`: ISO timestamp for when payout was marked paid out

### GET /bookings/stats

- Auth: required, role `host | admin`
- Response 200:

```json
{
  "totalPendingBookings": 0,
  "totalConfirmedBookings": 0,
  "totalCheckedInBookings": 0,
  "totalPaidOutBookings": 0
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
  "status": "confirmed"
}

```

- `status` can be: `pending`, `payment_failed`, `confirmed`, `declined`, `checked_in`, `completed`, `cancelled`, `paid_out`.

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
  "action": "check-in"
}
```

- [ ] `action`: `check-in`
- [ ] Response 200:

```json
{
  "bookingId": "688...",
  "status": "confirmed"
}
```

### POST /host/bookings/:id/withdraw

- Auth: required, role `host | admin`
- Behavior:
  - creates or reuses a pending payout request;
  - sends notification email to configured admin recipients for manual transfer;
  - does not auto-transfer through Paystack in this request;
  - booking stays in current status until payout is manually completed.
- Response 200:

```json
{
  "bookingId": "688...",
  "status": "payout_requested",
  "paidOutAmount": 42000
}
```

- `status` returns `payout_requested` after request submission and remains so until admin manually marks the booking `paid_out`.

---

## Webhook Endpoints

### POST /webhooks/whatsapp

- Auth: none (signature-verified in controller)
- Required header:
  - `x-twilio-signature`

- Purpose: verifies Twilio signature and processes host check-in command replies.
- Supported host reply inputs:
  - text command: `CHECK-IN <bookingId>`
  - WhatsApp quick-reply/button payload from Twilio (for interactive templates)

### POST /webhooks/paystack

- Auth: none
- Signature: `x-paystack-signature` validated with your Paystack secret key against raw request body.
- Purpose:
  - marks booking `confirmed` when `charge.success` with `data.status=success` is received;
  - marks booking `payment_failed` when failed charge outcome is received (for example `charge.failed` or `data.status=failed`).
- Dashboard setup: set your Paystack webhook URL to your public backend URL + `/webhooks/paystack` (for example: `https://api.kribo.com/webhooks/paystack`).
- Notes:

  - This endpoint is idempotent using Paystack event id.
  - Non-payment events are safely acknowledged and ignored.
  - Returns `200` for accepted/ignored events so Paystack does not keep retrying handled callbacks.
- Body example (Twilio-style payload):

```json
{
  "Body": "CHECK-IN 688b3024bca1aeb3e90f7a3f",
  "MessageSid": "SM123",
  "From": "whatsapp:+2348012345678"
}
```

- Response 200:

```json
{
  "ok": true,
  "processed": true
}
```

- Notes:
  - If command format is invalid or sender is not a host, response is still `200` with ignored/processed false semantics to avoid Twilio retry loops.
  - Supported command format: `CHECK-IN <BOOKING_ID>` (24-char MongoDB ObjectId).

---

## Admin Endpoints

All admin endpoints require auth and role `admin`.

### GET /admin/overview

- Response 200: users and operations summary counters used by dashboard cards.

### GET /admin/users

- Query:
  - `search` optional (`name/email/phone` partial match)
  - `role` optional (`guest|host|admin`)
  - `isSuspended` optional (`true|false`)
  - `page`, `limit` optional pagination
- Response 200: paginated users list.

### PATCH /admin/users/:id

- Body (any subset):

```json
{
  "name": "Updated Name",
  "role": "host",
  "phoneNumber": "+2348012345678",
  "hostVerified": true,
  "emailVerified": true
}
```

- Response 200: updated user.

### POST /admin/users/:id/suspend

- Response 200:

```json
{
  "ok": true
}
```

- Notes: suspended users cannot login or access protected routes.

### POST /admin/users/:id/restore

- Response 200:

```json
{
  "ok": true
}
```

### GET /admin/properties

- Query:
  - `search` optional (`name/city/area`)
  - `city` optional
  - `verified` optional (`true|false`)
  - `bookingEnabled` optional (`true|false`)
  - `page`, `limit` optional pagination
- Response 200: paginated properties list.

### PATCH /admin/properties/:id

- Body (any subset):

```json
{
  "verified": true,
  "bookingEnabled": true,
  "instantBookEligible": true,
  "hostTrustTier": "trusted"
}
```

- Response 200: updated property.

### GET /admin/units

- Query:
  - `search` optional (`unit name` partial match)
  - `propertyId` optional
  - `hostId` optional
  - `isAvailable` optional (`true|false`)
  - `page`, `limit` optional pagination
- Response 200: paginated unit list.

### PATCH /admin/units/:id

- Body (any subset):

```json
{
  "name": "Deluxe Room",
  "maxGuests": 3,
  "pricePerNight": 85000,
  "isAvailable": true
}
```

- Response 200: updated unit.

### GET /admin/bookings/all

- Query:
  - `search` optional (booking/host/guest ObjectId)
  - `status` optional booking status
  - `page`, `limit` optional pagination
- Response 200: paginated bookings list.

### PATCH /admin/bookings/:id/status

- Body:

```json
{
  "status": "completed"
}
```

- Response 200: updated booking.

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

### GET /admin/payouts

- Query:
  - `search` optional (transfer reference)
  - `status` optional (`pending|completed|failed`)
  - `page`, `limit` optional pagination
- Response 200: paginated payouts list.

### POST /admin/payouts/:id/mark-paid-out

- `:id` is booking id.
- Response 200:

```json
{
  "ok": true
}
```

- Behavior:
  - marks payout `completed` with an admin transfer reference;
  - sets booking status to `paid_out`.

### GET /admin/payments

- Query:
  - `search` optional (`gatewayReference/internalReference`)
  - `status` optional (`pending|success|failed|abandoned|refunded`)
  - `page`, `limit` optional pagination
- Response 200: paginated payments list.

### GET /admin/disputes/all

- Query:
  - `status` optional (`open|resolved`)
  - `page`, `limit` optional pagination
- Response 200: paginated disputes list.

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

### GET /admin/audit-logs

- Query:
  - `action` optional (exact action name)
  - `page`, `limit` optional pagination
- Response 200: paginated admin action audit logs.

### GET /admin/onboarding/reviews

- Query:
  - `search` optional (`name/email` partial match)
  - `role` optional (`guest|host`)
  - `status` optional (`pending|approved|rejected`)
  - `page`, `limit` optional pagination
- Response 200: paginated onboarding review queue including guest/host KYC details and uploaded document URLs.

### POST /admin/onboarding/reviews/:id/decision

- Body:

```json
{
  "role": "host",
  "decision": "approve",
  "note": "NIN and bank account verified"
}
```

- `role`: `guest | host`
- `decision`: `approve | reject`
- `note`: required when `decision` is `reject` (minimum 3 characters)
- Response 200: summary of updated verification state.
- Behavior: when `role=host` and `decision=reject`, system sends a host email containing the rejection reason note.

### GET /admin/profile-change-requests

- Query:
  - `search` optional (`name/email` partial match)
  - `role` optional (`guest|host`)
  - `section` optional (`host_manager|host_business_contact|host_property|guest_profile`)
  - `status` optional (`pending|approved|rejected`)
  - `page`, `limit` optional pagination
- Response 200: paginated profile change requests including section, old value, requested value, and review status.

### POST /admin/profile-change-requests/:id/decision

- Body:

```json
{
  "decision": "approve",
  "note": "Documents and contact details verified"
}
```

- `decision`: `approve | reject`
- `note`: required when `decision` is `reject` (minimum 3 characters)
- Response 200: request decision summary.
- Behavior:
  - Approve applies the requested manager/business-contact/property/guest-profile values to active fields.
  - Reject preserves existing active profile fields and records the review note.

### GET /admin/hosts

- Response 200: list of unverified hosts.

### GET /admin/host/:id/earnings

- Response 200: host earnings summary.

---

## Docs Endpoint

### GET /docs

- Auth: none
- Response: Swagger UI page.

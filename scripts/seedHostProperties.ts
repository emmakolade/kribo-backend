import bcrypt from 'bcryptjs';
import { config as dotenvConfig } from 'dotenv';
import mongoose, { type Types } from 'mongoose';
import { PropertyModel } from '../src/models/property.model';
import { UnitModel } from '../src/models/unit.model';
import { UserModel } from '../src/models/user.model';

dotenvConfig();

interface UnitSeed {
  name: string;
  maxGuests: number;
  pricePerNight: number;
  photos: string[];
}

interface PropertySeed {
  name: string;
  description: string;
  city: string;
  area: string;
  fullAddress: string;
  location: { type: 'Point'; coordinates: [number, number] };
  amenities: string[];
  photos: string[];
  propertyType: 'hotel' | 'shortlet';
  units: [UnitSeed, UnitSeed];
}

interface HostSeed {
  email: string;
  name: string;
  phoneNumber: string;
  phoneCountryIso: string;
  phoneCountryDialCode: string;
  bankDetails: {
    accountNumber: string;
    bankCode: string;
    bankName: string;
    accountName: string;
    recipientCode: string;
  };
  property: PropertySeed;
}

const plainPassword = 'Kolade@123';

const hosts: HostSeed[] = [
  {
    email: 'emmakolade+host1@gmail.com',
    name: 'Adewale Akinyemi',
    phoneNumber: '+2348031122334',
    phoneCountryIso: 'NG',
    phoneCountryDialCode: '+234',
    bankDetails: {
      accountNumber: '0123456789',
      bankCode: '058',
      bankName: 'Guaranty Trust Bank',
      accountName: 'ADEWALE AKINYEMI',
      recipientCode: 'RCP_SEED_HOST_1',
    },
    property: {
      name: 'Ikeja Maple Residences',
      description: 'Modern serviced residence in Ikeja GRA with stable power, fast Wi-Fi, 24/7 security, and close access to Murtala Muhammed Airport and major business districts.',
      city: 'Lagos',
      area: 'Ikeja GRA',
      fullAddress: '18 Oduduwa Crescent, Ikeja GRA, Lagos',
      location: { type: 'Point', coordinates: [3.3448, 6.5831] },
      amenities: ['wifi', 'air_conditioning', 'power_backup', 'parking', 'security', 'breakfast', 'room_service'],
      photos: [
        'https://images.unsplash.com/photo-1566073771259-6a8506099945',
        'https://images.unsplash.com/photo-1551882547-ff40c63fe5fa',
        'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267',
      ],
      propertyType: 'hotel',
      units: [
        {
          name: 'Deluxe King Room',
          maxGuests: 2,
          pricePerNight: 65000,
          photos: [
            'https://images.unsplash.com/photo-1590490360182-c33d57733427',
            'https://images.unsplash.com/photo-1618773928121-c32242e63f39',
            'https://images.unsplash.com/photo-1631049552240-59c37f38802b',
          ],
        },
        {
          name: 'Executive Studio Suite',
          maxGuests: 3,
          pricePerNight: 90000,
          photos: [
            'https://images.unsplash.com/photo-1595576508898-0ad5c879a061',
            'https://images.unsplash.com/photo-1496417263034-38ec4f0b665a',
            'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b',
          ],
        },
      ],
    },
  },
  {
    email: 'emmakolade+host2@gmail.com',
    name: 'Chiamaka Okafor',
    phoneNumber: '+2348064455667',
    phoneCountryIso: 'NG',
    phoneCountryDialCode: '+234',
    bankDetails: {
      accountNumber: '1029384756',
      bankCode: '044',
      bankName: 'Access Bank',
      accountName: 'CHIAMAKA OKAFOR',
      recipientCode: 'RCP_SEED_HOST_2',
    },
    property: {
      name: 'Wuse Urban Haven Apartments',
      description: 'Tastefully finished shortlet apartments in Wuse 2 with premium interiors, secure parking, and direct access to restaurants, embassies, and key business hubs in Abuja.',
      city: 'Abuja',
      area: 'Wuse 2',
      fullAddress: '14 Kumasi Crescent, Wuse 2, Abuja',
      location: { type: 'Point', coordinates: [7.4821, 9.0804] },
      amenities: ['wifi', 'air_conditioning', 'power_backup', 'parking', 'security', 'kitchen', 'laundry_service'],
      photos: [
        'https://images.unsplash.com/photo-1505693416388-ac5ce068fe85',
        'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688',
        'https://images.unsplash.com/photo-1493663284031-b7e3aefcae8e',
      ],
      propertyType: 'shortlet',
      units: [
        {
          name: 'One Bedroom Premium',
          maxGuests: 2,
          pricePerNight: 80000,
          photos: [
            'https://images.unsplash.com/photo-1560185007-cde436f6a4d0',
            'https://images.unsplash.com/photo-1616594039964-3d733b8ce3bf',
            'https://images.unsplash.com/photo-1523755231516-e43fd2e8dca5',
          ],
        },
        {
          name: 'Two Bedroom Family Loft',
          maxGuests: 4,
          pricePerNight: 120000,
          photos: [
            'https://images.unsplash.com/photo-1554995207-c18c203602cb',
            'https://images.unsplash.com/photo-1484101403633-562f891dc89a',
            'https://images.unsplash.com/photo-1617806118233-18e1de247200',
          ],
        },
      ],
    },
  },
  {
    email: 'emmakolade+host3@gmail.com',
    name: 'Tunde Balogun',
    phoneNumber: '+2348097788990',
    phoneCountryIso: 'NG',
    phoneCountryDialCode: '+234',
    bankDetails: {
      accountNumber: '5647382910',
      bankCode: '011',
      bankName: 'First Bank of Nigeria',
      accountName: 'TUNDE BALOGUN',
      recipientCode: 'RCP_SEED_HOST_3',
    },
    property: {
      name: 'GRA Garden Court Hotel',
      description: 'Comfort-focused hotel in Port Harcourt GRA with serene landscaping, on-site dining, conference spaces, and reliable hospitality services for business and leisure travelers.',
      city: 'Port Harcourt',
      area: 'GRA Phase 2',
      fullAddress: '9 Ken Saro-Wiwa Road, GRA Phase 2, Port Harcourt, Rivers',
      location: { type: 'Point', coordinates: [7.0174, 4.8162] },
      amenities: ['wifi', 'air_conditioning', 'power_backup', 'parking', 'restaurant', 'bar', 'conference_room', 'security'],
      photos: [
        'https://images.unsplash.com/photo-1520250497591-112f2f40a3f4',
        'https://images.unsplash.com/photo-1564501049412-61c2a3083791',
        'https://images.unsplash.com/photo-1445019980597-93fa8acb246c',
      ],
      propertyType: 'hotel',
      units: [
        {
          name: 'Classic Queen Room',
          maxGuests: 2,
          pricePerNight: 55000,
          photos: [
            'https://images.unsplash.com/photo-1540518614846-7eded433c457',
            'https://images.unsplash.com/photo-1505693314120-0d443867891c',
            'https://images.unsplash.com/photo-1598928636135-d146006ff4be',
          ],
        },
        {
          name: 'Business Corner Suite',
          maxGuests: 3,
          pricePerNight: 85000,
          photos: [
            'https://images.unsplash.com/photo-1578683010236-d716f9a3f461',
            'https://images.unsplash.com/photo-1505691938895-1758d7feb511',
            'https://images.unsplash.com/photo-1505409628601-edc9af17fda6',
          ],
        },
      ],
    },
  },
];

function buildHostCompliance(host: HostSeed) {
  const now = new Date();
  return {
    businessContact: {
      businessPhoneNumber: host.phoneNumber,
      businessPhoneCountryIso: host.phoneCountryIso,
      businessPhoneCountryDialCode: host.phoneCountryDialCode,
      trustedWhatsappNumber: host.phoneNumber,
      trustedWhatsappCountryIso: host.phoneCountryIso,
      trustedWhatsappCountryDialCode: host.phoneCountryDialCode,
      officeAddress: host.property.fullAddress,
      officeLga: host.property.area,
      officeState: host.property.city,
      website: `https://${host.property.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.ng`,
      completedAt: now,
    },
    manager: {
      managerName: host.name,
      dateOfBirth: new Date('1990-01-15'),
      nationality: 'Nigerian',
      ninNumber: '12345678901',
      ninDocumentUrl: 'https://images.unsplash.com/photo-1450101499163-c8848c66ca85',
      managerHomeAddress: host.property.fullAddress,
      proofOfAddressUrl: 'https://images.unsplash.com/photo-1586281380349-632531db7ed4',
      completedAt: now,
    },
    bankAccount: {
      accountNumber: host.bankDetails.accountNumber,
      bankCode: host.bankDetails.bankCode,
      bankName: host.bankDetails.bankName,
      accountName: host.bankDetails.accountName,
      verificationStatus: 'verified',
      completedAt: now,
    },
    serviceAgreement: {
      accepted: true,
      acceptedAt: now,
      version: 'v1',
    },
    isBusinessActive: true,
    activatedAt: now,
  };
}

async function upsertHost(host: HostSeed, passwordHash: string): Promise<{ _id: Types.ObjectId }> {
  const now = new Date();
  const hostCompliance = buildHostCompliance(host);

  const user = await UserModel.findOneAndUpdate(
    { email: host.email.toLowerCase() },
    {
      $set: {
        name: host.name,
        role: 'host',
        passwordHash,
        phoneNumber: host.phoneNumber,
        phoneCountryIso: host.phoneCountryIso,
        phoneCountryDialCode: host.phoneCountryDialCode,
        emailVerified: true,
        emailVerifiedAt: now,
        hostVerified: true,
        hostOnboarding: {
          propertyName: host.property.name,
          propertyType: host.property.propertyType,
        },
        hostCompliance,
        bankDetails: {
          accountNumber: host.bankDetails.accountNumber,
          bankCode: host.bankDetails.bankCode,
          bankName: host.bankDetails.bankName,
          accountName: host.bankDetails.accountName,
          recipientCode: host.bankDetails.recipientCode,
        },
      },
      $setOnInsert: {
        email: host.email.toLowerCase(),
      },
    },
    { upsert: true, returnDocument: 'after', runValidators: true },
  ).lean<{ _id: Types.ObjectId } | null>();

  if (!user?._id) {
    throw new Error(`Failed to create or update host user: ${host.email}`);
  }

  return { _id: user._id };
}

async function upsertPropertyAndUnits(hostId: Types.ObjectId, property: PropertySeed): Promise<void> {
  const savedProperty = await PropertyModel.findOneAndUpdate(
    { hostId, name: property.name },
    {
      $set: {
        hostId,
        name: property.name,
        description: property.description,
        city: property.city,
        area: property.area,
        fullAddress: property.fullAddress,
        location: property.location,
        amenities: property.amenities,
        photos: property.photos,
        propertyType: property.propertyType,
        bookingEnabled: true,
        verified: true,
        instantBookEligible: true,
        hostTrustTier: 'trusted',
      },
    },
    { upsert: true, returnDocument: 'after', runValidators: true },
  ).lean<{ _id: Types.ObjectId } | null>();

  if (!savedProperty?._id) {
    throw new Error(`Failed to create or update property: ${property.name}`);
  }

  for (const unit of property.units) {
    await UnitModel.findOneAndUpdate(
      { propertyId: savedProperty._id, name: unit.name },
      {
        $set: {
          propertyId: savedProperty._id,
          name: unit.name,
          maxGuests: unit.maxGuests,
          pricePerNight: unit.pricePerNight,
          photos: unit.photos,
          isAvailable: true,
        },
      },
      { upsert: true, returnDocument: 'after', runValidators: true },
    );
  }
}

async function run(): Promise<void> {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    throw new Error('MONGO_URI is not set. Add it to your environment or .env file.');
  }

  await mongoose.connect(mongoUri);
  const passwordHash = await bcrypt.hash(plainPassword, 12);

  let hostCount = 0;
  let propertyCount = 0;
  let unitCount = 0;

  for (const host of hosts) {
    const savedHost = await upsertHost(host, passwordHash);
    hostCount += 1;
    await upsertPropertyAndUnits(savedHost._id, host.property);
    propertyCount += 1;
    unitCount += host.property.units.length;
  }

  await mongoose.disconnect();

  // eslint-disable-next-line no-console
  console.log(`Seed complete: ${hostCount} hosts, ${propertyCount} properties, ${unitCount} units.`);
}

run().catch(async (error: unknown) => {
  // eslint-disable-next-line no-console
  console.error('Seeding failed:', error);
  try {
    await mongoose.disconnect();
  } catch {
    // Ignore disconnect errors.
  }
  process.exit(1);
});
import mongoose, { Types } from 'mongoose';
import bcrypt from 'bcryptjs';
import { env } from '../src/config/env';
import { AvailabilityModel } from '../src/models/availability.model';
import { PropertyModel } from '../src/models/property.model';
import { UnitModel } from '../src/models/unit.model';
import { UserModel } from '../src/models/user.model';

const SEED_PASSWORD = 'Kribo12345';

function nextDays(days: number): Date[] {
  const out: Date[] = [];
  const base = new Date();
  for (let i = 0; i < days; i += 1) {
    const d = new Date(base);
    d.setUTCDate(base.getUTCDate() + i);
    d.setUTCHours(0, 0, 0, 0);
    out.push(d);
  }
  return out;
}

async function main(): Promise<void> {
  await mongoose.connect(env.MONGO_URI);
  const passwordHash = await bcrypt.hash(SEED_PASSWORD, 12);

  await Promise.all([
    AvailabilityModel.deleteMany({}),
    UnitModel.deleteMany({}),
    PropertyModel.deleteMany({}),
    UserModel.deleteMany({}),
  ]);

  const hosts = await UserModel.insertMany([
    {
      _id: new Types.ObjectId(),
      name: 'Aisha Bello',
      email: 'aisha@kribo.dev',
      passwordHash,
      phoneNumber: '+2348030000001',
      role: 'host',
      hostVerified: true,
      bankDetails: {
        accountNumber: '0123456789',
        bankCode: '058',
        accountName: 'Aisha Bello',
        recipientCode: 'RCP_AISHA',
      },
    },
    {
      _id: new Types.ObjectId(),
      name: 'Chinedu Okafor',
      email: 'chinedu@kribo.dev',
      passwordHash,
      phoneNumber: '+2348030000002',
      role: 'host',
      hostVerified: true,
      bankDetails: {
        accountNumber: '9876543210',
        bankCode: '044',
        accountName: 'Chinedu Okafor',
        recipientCode: 'RCP_CHINEDU',
      },
    },
  ]);
  const [hostA, hostB] = hosts;

  await UserModel.create({
    name: 'Ngozi Guest',
    email: 'ngozi@kribo.dev',
    passwordHash,
    phoneNumber: '+2348030000003',
    role: 'guest',
  });

  const properties = await PropertyModel.insertMany([
    {
      hostId: hostA!._id,
      name: 'Lekki Lagoon Suites',
      description: 'Modern shortlet with lagoon view in Lekki Phase 1.',
      city: 'Lagos',
      area: 'Lekki',
      fullAddress: 'Lekki, Lagos',
      location: { type: 'Point', coordinates: [3.4906, 6.4474] },
      amenities: ['wifi', 'swimming_pool', 'parking'],
      photos: ['https://example.com/lagoon-1.jpg', 'https://example.com/lagoon-2.jpg'],
      propertyType: 'shortlet',
      verified: true,
    },
    {
      hostId: hostB!._id,
      name: 'Wuse City Hotel',
      description: 'Business-friendly hotel close to central Abuja.',
      city: 'Abuja',
      area: 'Wuse 2',
      fullAddress: 'Wuse 2, Abuja',
      location: { type: 'Point', coordinates: [7.4891, 9.0765] },
      amenities: ['wifi', 'breakfast', 'gym'],
      photos: ['https://example.com/wuse-1.jpg', 'https://example.com/wuse-2.jpg'],
      propertyType: 'hotel',
      verified: true,
    },
    {
      hostId: hostA!._id,
      name: 'GRA Riverside Apartment',
      description: 'Quiet 2-bedroom apartment in Port Harcourt GRA.',
      city: 'Port Harcourt',
      area: 'GRA',
      fullAddress: 'GRA, Port Harcourt',
      location: { type: 'Point', coordinates: [7.0189, 4.8156] },
      amenities: ['wifi', 'kitchen', 'parking'],
      photos: ['https://example.com/gra-1.jpg', 'https://example.com/gra-2.jpg'],
      propertyType: 'shortlet',
      verified: true,
    },
  ]);

  const units = await UnitModel.insertMany([
    {
      propertyId: properties[0]!._id,
      name: 'Entire 1-bedroom',
      maxGuests: 2,
      pricePerNight: 75000,
    },
    {
      propertyId: properties[1]!._id,
      name: 'Standard Room',
      maxGuests: 2,
      pricePerNight: 55000,
    },
    {
      propertyId: properties[2]!._id,
      name: 'Entire 2-bedroom',
      maxGuests: 4,
      pricePerNight: 62000,
    },
  ]);

  const dates = nextDays(30);
  const docs = units.flatMap((unit) =>
    dates.map((date) => ({
      unitId: unit._id,
      date,
      status: 'open' as const,
    })),
  );

  await AvailabilityModel.insertMany(docs);

  await mongoose.disconnect();
  console.log('Seed completed with Lagos/Abuja/Port Harcourt sample data.');
  console.log(`Seed user password: ${SEED_PASSWORD}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});

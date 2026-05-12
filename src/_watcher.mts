import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
db.registration.findUnique({
  where: { id: "cmou7q4cx000jiog47v4bxlkq" },
  select: { paymentProcessedAt: true, notificationSentAt: true, hubspotContactId: true },
}).then(r => {
  const proc = r?.paymentProcessedAt ? "SET" : "null";
  const notif = r?.notificationSentAt ? "SET" : "null";
  const hs = r?.hubspotContactId ? "SET" : "null";
  console.log(`proc=${proc} notif=${notif} hs=${hs}`);
  db.$disconnect();
}).catch(e => { console.error(e); process.exit(1); });

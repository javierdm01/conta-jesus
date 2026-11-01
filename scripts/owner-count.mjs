import {PrismaClient} from '@prisma/client';
const db=new PrismaClient();
try {console.log(await db.user.count({where:{role:'ADMIN'}}));} finally {await db.$disconnect();}

import {PrismaClient,RoleCode,TemplateStatus} from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma=new PrismaClient();
const samples=[
 {slug:'commerce-kit',name:'Commerce Kit',category:'E-Commerce',description:'An elegant storefront UI with responsive catalog, product views and polished shopping layouts.',priceMmk:45000,technology:['Next.js','TypeScript','Tailwind CSS'],licenseType:'Commercial',status:TemplateStatus.PUBLISHED},
 {slug:'restaurant-pro',name:'Restaurant Pro',category:'Restaurant',description:'An atmospheric restaurant experience with menu presentation and reservation call-to-action.',priceMmk:35000,technology:['Next.js','Tailwind CSS'],licenseType:'Commercial',status:TemplateStatus.PUBLISHED},
 {slug:'agency-flow',name:'Agency Flow',category:'Business',description:'A confident studio presence with service sections, case studies and lead generation layouts.',priceMmk:39000,technology:['Next.js','TypeScript','Tailwind CSS'],licenseType:'Commercial',status:TemplateStatus.PUBLISHED},
];
async function main(){
 for(const code of Object.values(RoleCode)) await prisma.adminRole.upsert({where:{code},update:{},create:{code,name:code.replace('_',' ')}});
 for(const sample of samples){const category=await prisma.category.upsert({where:{slug:sample.category.toLowerCase().replace(/[^a-z0-9]+/g,'-')},update:{name:sample.category},create:{name:sample.category,slug:sample.category.toLowerCase().replace(/[^a-z0-9]+/g,'-')}});const {category:_,...templateData}=sample;await prisma.template.upsert({where:{slug:sample.slug},update:{...templateData,categoryId:category.id},create:{...templateData,categoryId:category.id,publishedAt:new Date()}})}
 for(const s of [{name:'Landing Pages',slug:'landing-pages',description:'Focused pages that convert.'},{name:'Business Websites',slug:'business-websites',description:'Credible digital homes for growing teams.'}]) await prisma.service.upsert({where:{slug:s.slug},update:s,create:s});
 for(const p of [{code:'KBZPAY',name:'KBZPay'},{code:'WAVEPAY',name:'WavePay'}]) await prisma.paymentMethod.upsert({where:{code:p.code},update:{name:p.name},create:{...p,accountHolderName:'',walletNumber:'',instructions:'Payment details will be configured by an authorized administrator.',isEnabled:false}});
 const email=process.env.ADMIN_EMAIL;const password=process.env.ADMIN_PASSWORD;if(email&&password){const role=await prisma.adminRole.findUniqueOrThrow({where:{code:RoleCode.SUPER_ADMIN}});await prisma.user.upsert({where:{email:email.toLowerCase()},update:{roleId:role.id},create:{email:email.toLowerCase(),name:'Super Admin',passwordHash:await bcrypt.hash(password,12),roleId:role.id}})}
}
main().finally(()=>prisma.$disconnect());

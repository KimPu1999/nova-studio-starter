import {RoleCode,VendorMemberRole} from '@prisma/client';
import {prisma} from '@/lib/prisma';
import {requireUser} from '@/lib/auth';

export async function getVendorMemberships(userId:string){
  return prisma.vendorMember.findMany({where:{userId,revokedAt:null,acceptedAt:{not:null},vendor:{isSuspended:false}},include:{vendor:true},orderBy:{invitedAt:'asc'}});
}

export async function requireVendorMember(vendorId?:string){
  const user=await requireUser();
  const memberships=await getVendorMemberships(user.id);
  const membership=vendorId?memberships.find(row=>row.vendorId===vendorId):memberships[0];
  if(!membership)throw new Error('Vendor access is not available.');
  return {user,membership,vendor:membership.vendor};
}

export async function requireVendorAdmin(){
  const user=await requireUser();
  const allowed:RoleCode[]=[RoleCode.SUPER_ADMIN,RoleCode.ADMIN];
  if(!allowed.includes(user.role.code))throw new Error('Admin access required.');
  return user;
}

export function canManageVendor(role:VendorMemberRole){return ['VENDOR_OWNER','VENDOR_MANAGER','VENDOR_EDITOR'].includes(role);}
export function canManageVendorFinance(role:VendorMemberRole){return ['VENDOR_OWNER','VENDOR_FINANCE'].includes(role);}

import { contactRole, contactRoleLabel, contactSpecialty, contactCityLabel } from './lib/contacts.ts';
import fs from 'fs';
const rows=JSON.parse(fs.readFileSync('./public/public-contacts-seed.json','utf8'));
const counts={};
for(const c of rows){const r=contactRole(c);counts[r]=(counts[r]||0)+1;}
console.log(counts);
for(const c of rows.slice(0,6)) console.log(c.name,'|',contactRoleLabel(contactRole(c)),'|',contactSpecialty(c),'|',contactCityLabel(c));
console.log('no city',rows.filter(c=>!c.city.trim()).length,'no contact',rows.filter(c=>!c.phone&&!c.email&&!c.website).length);

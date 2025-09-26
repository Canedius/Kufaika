const str = 'Р—Р°РІР°РЅС‚Р°Р¶РµРЅРЅСЏ РґР°РЅРёС…вЂ¦';
const fixed = Buffer.from(str, 'latin1').toString('utf8');
console.log(fixed);

import iconv from "iconv-lite";
const str = 'Р—Р°РІР°РЅС‚Р°Р¶РµРЅРЅСЏ РґР°РЅРёС…вЂ¦';
console.log(iconv.decode(Buffer.from(str, 'binary'), 'utf8'));
console.log(iconv.decode(Buffer.from(str, 'binary'), 'windows-1251'));

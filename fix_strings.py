from pathlib import Path
path = Path('script.js')
text = path.read_text(encoding='utf-8')
text = text.replace("Р—Р°РІР°РЅС‚Р°Р¶РµРЅРЅСЏ РґР°РЅРёС…вЂ¦", "Завантаження даних…")
text = text.replace("Р”Р°РЅС– РІС–РґСЃСѓС‚РЅС–", "Дані відсутні")
text = text.replace("РџРѕРјРёР»РєР° Р·Р°РІР°РЅС‚Р°Р¶РµРЅРЅСЏ РґР°РЅРёС…", "Помилка завантаження даних")
path.write_text(text, encoding='utf-8')

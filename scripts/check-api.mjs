// Перевіряємо API на наявність жовтня 2025
const response = await fetch("https://hoodie-sales-worker.kanedius.workers.dev/api/sales");
const data = await response.json();

console.log('🔍 Перевіряємо дані API за жовтень 2025...\n');

const oct2025Data = data.products.flatMap(product => 
  product.months.filter(month => 
    month.month === 'Жовтень' && month.year === 2025
  )
);

if (oct2025Data.length === 0) {
  console.log('❌ Жодних даних за жовтень 2025 не знайдено в API!');
  
  // Показуємо останні місяці
  const latestMonths = data.products.flatMap(product => 
    product.months.slice(-3).map(month => ({
      product: product.name,
      month: month.month,
      year: month.year
    }))
  );
  
  console.log('\n📅 Останні місяці в API:');
  latestMonths.forEach(item => {
    console.log(`  ${item.product}: ${item.month} ${item.year}`);
  });
  
} else {
  console.log('✅ Знайдено дані за жовтень 2025:');
  oct2025Data.forEach(month => {
    const totalSales = Object.values(month.colors).flat().reduce((sum, size) => sum + size.quantity, 0);
    console.log(`  📊 ${totalSales} продажів`);
  });
}

console.log('\n🔄 Рекомендація: Можливо треба перезавантажити дані в API або очистити кеш.');
import { useState, useEffect, useCallback } from 'react';

export interface SaleDataPoint {
  time: string;
  sales: number;
}

export interface LatestPayment {
  id: string;
  amount: number;
  product: string;
  customer: string;
  time: string;
}

const PRODUCTS = [
  "Premium Networkly Subscription",
  "Career Mentorship Session",
  "Resume Review Pro",
  "LinkedIn Profile Optimization",
  "Interview Prep Workshop"
];

const CUSTOMERS = [
  "Alex Chen",
  "Sarah Jenkins",
  "Michael Rodriguez",
  "Emily Wong",
  "David Smith",
  "Jessica Taylor",
  "Robert Brown",
  "Lisa Garcia"
];

export function useRealtimeSalesData() {
  const [totalRevenue, setTotalRevenue] = useState(12450.75);
  const [salesCount, setSalesCount] = useState(156);
  const [salesChartData, setSalesChartData] = useState<SaleDataPoint[]>([]);
  const [cumulativeRevenueData, setCumulativeRevenueData] = useState<SaleDataPoint[]>([]);
  const [latestPayments, setLatestPayments] = useState<LatestPayment[]>([]);

  const averageSale = salesCount > 0 ? totalRevenue / salesCount : 0;

  const generateTimeStr = useCallback((date: Date) => {
    return date.toTimeString().split(' ')[0];
  }, []);

  // Initialize data
  useEffect(() => {
    const now = new Date();
    const initialSales: SaleDataPoint[] = [];
    const initialRev: SaleDataPoint[] = [];
    
    let runningRev = totalRevenue - 500;
    
    for (let i = 60; i >= 0; i--) {
      const time = new Date(now.getTime() - i * 2000);
      const sales = Math.random() * 50 + 10;
      initialSales.push({ time: generateTimeStr(time), sales });
      
      runningRev += sales;
      initialRev.push({ time: generateTimeStr(time), sales: runningRev });
    }
    
    setSalesChartData(initialSales);
    setCumulativeRevenueData(initialRev);
    
    // Initial payments
    const payments: LatestPayment[] = Array.from({ length: 5 }).map((_, i) => ({
      id: `p-${i}`,
      amount: Math.random() * 100 + 20,
      product: PRODUCTS[Math.floor(Math.random() * PRODUCTS.length)],
      customer: CUSTOMERS[Math.floor(Math.random() * CUSTOMERS.length)],
      time: generateTimeStr(new Date(now.getTime() - i * 60000))
    }));
    setLatestPayments(payments);
  }, [generateTimeStr]);

  // Real-time updates
  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      const timeStr = generateTimeStr(now);
      const newSale = Math.random() * 80 + 20;

      setTotalRevenue(prev => prev + newSale);
      setSalesCount(prev => prev + 1);

      setSalesChartData(prev => {
        const newData = [...prev.slice(-59), { time: timeStr, sales: newSale }];
        return newData;
      });

      setCumulativeRevenueData(prev => {
        const lastRev = prev.length > 0 ? prev[prev.length - 1].sales : totalRevenue;
        const newData = [...prev.slice(-59), { time: timeStr, sales: lastRev + newSale }];
        return newData;
      });

      // Update payments roughly every 5 seconds
      if (Math.random() > 0.6) {
        setLatestPayments(prev => [
          {
            id: `p-${Date.now()}`,
            amount: newSale,
            product: PRODUCTS[Math.floor(Math.random() * PRODUCTS.length)],
            customer: CUSTOMERS[Math.floor(Math.random() * CUSTOMERS.length)],
            time: timeStr
          },
          ...prev.slice(0, 9)
        ]);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [generateTimeStr, totalRevenue]);

  return {
    totalRevenue,
    cumulativeRevenueData,
    salesCount,
    averageSale,
    salesChartData,
    latestPayments,
  };
}

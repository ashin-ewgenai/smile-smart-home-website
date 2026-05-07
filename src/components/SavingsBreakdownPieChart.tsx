import React from 'react';
import { 
  PieChart, 
  Pie, 
  Cell, 
  ResponsiveContainer, 
  Tooltip,
  Legend
} from 'recharts';
import { motion } from 'framer-motion';

interface SavingsBreakdownPieChartProps {
  data: {
    lightingSavings: number;
    hvacSavings: number;
    standbySavings: number;
  };
}

export const SavingsBreakdownPieChart: React.FC<SavingsBreakdownPieChartProps> = ({ data }) => {
  const [isHovered, setIsHovered] = React.useState(false);

  const chartData = [
    { name: 'Lighting', value: data.lightingSavings, color: '#14b8a6' },
    { name: 'HVAC', value: data.hvacSavings, color: '#3b82f6' },
    { name: 'Standby', value: data.standbySavings, color: '#f59e0b' },
  ].filter(item => item.value > 0);

  const totalSavings = chartData.reduce((acc, curr) => acc + curr.value, 0);

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="w-full h-[240px] relative"
    >
      <ResponsiveContainer width="100%" height="100%">
        <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
          <Pie
            data={chartData}
            cx="50%"
            cy="45%"
            innerRadius={50}
            outerRadius={70}
            paddingAngle={5}
            dataKey="value"
            stroke="none"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
          >
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip 
            contentStyle={{ 
              backgroundColor: 'rgba(255, 255, 255, 0.98)', 
              borderRadius: '12px', 
              border: 'none',
              boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)',
              fontSize: '12px',
              fontWeight: 'bold'
            }}
            formatter={(value: number) => [`₹${value.toLocaleString()}`, 'Savings']}
          />
          <Legend 
            verticalAlign="bottom" 
            align="center"
            iconType="circle"
            formatter={(value) => {
              const item = chartData.find(d => d.name === value);
              const percentage = item ? ((item.value / totalSavings) * 100).toFixed(0) : 0;
              return (
                <span className="text-[10px] font-black text-slate-500 dark:text-gray-400 uppercase tracking-widest ml-1">
                  {value} ({percentage}%)
                </span>
              );
            }}
          />
        </PieChart>
      </ResponsiveContainer>
      
      <motion.div 
        animate={{ opacity: isHovered ? 0 : 1 }}
        transition={{ duration: 0.2 }}
        className="absolute top-[45%] left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none text-center"
      >
        <div className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Total</div>
        <div className="text-lg font-black text-teal">₹{totalSavings.toLocaleString()}</div>
      </motion.div>
    </motion.div>
  );
};

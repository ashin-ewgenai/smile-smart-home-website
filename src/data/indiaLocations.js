// Predefined India locations data
// - states: exhaustive list of 28 States + 8 Union Territories
// - districtsByState: exemplar mapping. Includes full Kerala districts. Add more as needed.

export const states = [
  // States (28)
  'Andhra Pradesh',
  'Arunachal Pradesh',
  'Assam',
  'Bihar',
  'Chhattisgarh',
  'Goa',
  'Gujarat',
  'Haryana',
  'Himachal Pradesh',
  'Jharkhand',
  'Karnataka',
  'Kerala',
  'Madhya Pradesh',
  'Maharashtra',
  'Manipur',
  'Meghalaya',
  'Mizoram',
  'Nagaland',
  'Odisha',
  'Punjab',
  'Rajasthan',
  'Sikkim',
  'Tamil Nadu',
  'Telangana',
  'Tripura',
  'Uttar Pradesh',
  'Uttarakhand',
  'West Bengal',
  // Union Territories (8)
  'Andaman and Nicobar Islands',
  'Chandigarh',
  'Dadra and Nagar Haveli and Daman and Diu',
  'Delhi',
  'Jammu and Kashmir',
  'Ladakh',
  'Lakshadweep',
  'Puducherry'
];

export const districtsByState = {
  // Full list for Kerala
  'Kerala': [
    'Thiruvananthapuram',
    'Kollam',
    'Pathanamthitta',
    'Alappuzha',
    'Kottayam',
    'Idukki',
    'Ernakulam',
    'Thrissur',
    'Palakkad',
    'Malappuram',
    'Kozhikode',
    'Wayanad',
    'Kannur',
    'Kasaragod'
  ],

  // Example subsets (extend as needed)
  'Tamil Nadu': [
    'Chennai', 'Coimbatore', 'Madurai', 'Tiruchirappalli', 'Salem', 'Tirunelveli', 'Erode', 'Vellore'
  ],
  'Karnataka': [
    'Bengaluru Urban', 'Bengaluru Rural', 'Mysuru', 'Mangaluru', 'Belagavi', 'Ballari', 'Dharwad'
  ],
  'Maharashtra': [
    'Mumbai', 'Mumbai Suburban', 'Pune', 'Thane', 'Nagpur', 'Nashik', 'Aurangabad'
  ],
  'Delhi': [
    'New Delhi', 'South Delhi', 'North Delhi', 'East Delhi', 'West Delhi', 'South West Delhi', 'North West Delhi'
  ],

  // Provide empty arrays as placeholders for now; can be filled out over time
  'Andhra Pradesh': [],
  'Arunachal Pradesh': [],
  'Assam': [],
  'Bihar': [],
  'Chhattisgarh': [],
  'Goa': [],
  'Gujarat': [],
  'Haryana': [],
  'Himachal Pradesh': [],
  'Jharkhand': [],
  'Madhya Pradesh': [],
  'Manipur': [],
  'Meghalaya': [],
  'Mizoram': [],
  'Nagaland': [],
  'Odisha': [],
  'Punjab': [],
  'Rajasthan': [],
  'Sikkim': [],
  'Telangana': [],
  'Tripura': [],
  'Uttar Pradesh': [],
  'Uttarakhand': [],
  'West Bengal': [],
  'Andaman and Nicobar Islands': [],
  'Chandigarh': [],
  'Dadra and Nagar Haveli and Daman and Diu': [],
  'Jammu and Kashmir': [],
  'Ladakh': [],
  'Lakshadweep': [],
  'Puducherry': []
};

export default { states, districtsByState };

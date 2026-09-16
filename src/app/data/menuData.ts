// ─── REAL MENU DATA ───────────────────────────────────────────────────────────

export const INDIAN_MENU = {
  name: 'Indian Menu',
  starters: {
    vegetarian: [
      'Chilli Mogo', 'Chilli Paneer', 'Chilli Gobi', 'Paneer Tikka', 'Gobi 65',
      'Aloo Tikki', 'Papdi Chat', 'Mini Gujarati Samosa', 'Mini Punjabi Samosa',
      'Vegetable Spring Rolls', 'Cauliflower Salt & Pepper',
    ],
    nonVegetarian: [
      'Chilli Chicken', 'Fish Cutlet', 'Mutton Roll', 'Chicken Tikka', 'Chicken 65',
      'Murgh Malai Tikka', 'Lamb Seekh Kebab', 'Chicken Samosa', 'Meat Samosa',
      'Tandoori Chicken Wings', 'Andhra Chicken 65',
    ],
  },
  mains: {
    vegetarian: [
      'Dal Tadka', 'Dal Makhani', 'Aloo Gobi Masala', 'Kadai Paneer', 'Channa Masala',
      'Aloo Matar', 'Karahi Mix Vegetable', 'Vegetable Jalfrezi', 'Bhindi Do Pyaza',
      'Aubergine with Aloo', 'Methi Malai Paneer', 'Veg Korma',
    ],
    nonVegetarian: [
      'Chicken Korma', 'Butter Chicken', 'Chicken Tikka Masala', 'Kadai Chicken',
      'Chicken Saag', 'Lamb Keema with peas', 'Mutton Jalfrezi', 'Mutton Roganjosh',
      'Mutton Kadai', 'Chicken Biryani with Bone/ Boneless',
      'Mutton Biryani with Bone/ Boneless', 'Hyderabadi Dum Biryani with Bone/ Boneless',
    ],
  },
  sundries: ['Rice - Plain, Pulao, Jeera', 'Assorted Naan Plain/ Butter'],
  desserts: [
    'Gulab Jamun', 'Rasmalai', 'Gajar Ka Halwa', 'Vanilla Ice-Cream', 'Kheer',
    'Premium Dessert £1.50 Per Head',
  ],
  allergyNotice: 'Food Prepared in our restaurant may contain following ingredients such as Milk, Egg, Wheat, Gluten, Crustaceans, Lupin, Mustard, Nuts, Sulphur',
};

export const SRI_LANKAN_MENU = {
  name: 'Sri Lankan Menu',
  starters: {
    vegetarian: [
      'Chilli Mogo', 'Chilli Paneer', 'Chilli Gobi', 'Paneer Tikka', 'Gobi 65',
      'Papdi Chat', 'Medu Vada', 'Vegetable Patti', 'Vegetable Samosa',
      'Vegetable Rolls', 'Cauliflower Salt & Pepper',
    ],
    nonVegetarian: [
      'Devil Chicken', 'Fish Cutlet', 'Mutton Roll', 'Chicken Tikka', 'Chicken 65',
      'Lamb Seekh Kebab', 'Chicken Samosa', 'Meat Samosa',
      'Tandoori chicken wings', 'Andhra chicken 65',
    ],
  },
  mains: {
    vegetarian: [
      'Dal Fry', 'Devil Potato', 'Paneer Curry', 'Brinjal Curry', 'Bhindi Masala',
      'Chana Masala', 'Vegetable Biryani', 'Veg Fried Rice', 'Veg Noodles',
      'String Hopper with Sodhi & Sambal',
    ],
    nonVegetarian: [
      'Nethli Puttu Kottu', 'Mutton Kottu', 'Chicken Kottu', 'Chicken Curry on Bone',
      'Mutton Curry', 'Pangirachi', 'Chicken Biryani on Bone', 'Mutton Biryani on Bone',
      'Hyderabadi Dum Biryani with Bone/ Boneless',
    ],
  },
  sundries: ['Rice - plain, Pulao, Jeera', 'Naan Plain OR Parotta'],
  desserts: [
    'Gulab Jamun', 'Rasmalai', 'Payasam', 'Vanilla Ice-Cream', 'Kesari',
    'Fruit salad', 'Premium dessert £1.50 per head',
  ],
  allergyNotice: 'Food Prepared in our restaurant may contain following ingredients such as Milk, Egg, Wheat, Gluten, Crustaceans, Lupin, Mustard, Nuts, Sulphur',
};

export const LIVE_COUNTER_PACKAGE = {
  name: 'Live Counter Package',
  srilankanSouthIndian: [
    { name: 'Live Kottu', price: 5.00 },
    { name: 'Live Puttu', price: 3.00 },
    { name: 'Live Hopper', price: 3.00 },
    { name: 'Live Dosa & Uthapam', price: 5.00 },
    { name: 'Live Poori Bhaji', price: 4.00 },
    { name: 'Live Pani Puri', price: 3.00 },
    { name: 'Live Fresh Coconut Water', price: 5.00 },
    { name: 'Live Paan Counter (100pcs)', price: 350.00 },
    { name: 'Welcome Drink', price: 2.00 },
  ],
  northIndian: [
    { name: 'Live Chole Bhature', price: 5.00 },
    { name: 'Live Poori Aloo Sabji', price: 4.00 },
    { name: 'Live Pani Puri', price: 3.00 },
    { name: 'Live Aloo Tikki Chat', price: 3.00 },
    { name: 'Live Pav Bhaji', price: 4.00 },
    { name: 'Live Paan Counter (100pcs)', price: 350.00 },
    { name: 'Welcome Drink', price: 2.00 },
  ],
  extras: [
    { name: 'Full Music Setup with Lighting', price: 350.00, note: 'DJ Optional If You Required + £250.00' },
    { name: '3D Led Dance Floor', price: 250.00 },
    { name: '4K LED Screen for Backdrop', price: 750.00 },
    { name: '360 Camera', price: 300.00 },
    { name: 'Candy Floss for Kids Birthday', price: 100.00 },
  ],
};

export const BANQUET_PACKAGES = [
  {
    id: 'basic',
    name: 'Basic Package',
    pricePerPerson: 25,
    kidsPrice: 18,
    tag: 'Limited Time',
    minGuests: 201,
    maxGuests: 300,
    guestLabel: 'Minimum 201-300 Guests',
    starters: { veg: 2, nonVeg: 1 },
    mains: { veg: 2, nonVeg: 1 },
    desserts: ['1 Indian Sweet Dish'],
    drinks: [],
    extras: [],
    color: '#6B7280',
  },
  {
    id: 'classic',
    name: 'Classic Package',
    pricePerPerson: 30,
    kidsPrice: 20,
    tag: '',
    minGuests: 101,
    maxGuests: 200,
    guestLabel: 'Minimum 101-200 Guests',
    starters: { veg: 2, nonVeg: 2 },
    mains: { veg: 2, nonVeg: 2 },
    desserts: ['1 Indian Sweet Dish'],
    drinks: ['1 Soft Drink & 1 Juice'],
    extras: [],
    color: '#92400E',
  },
  {
    id: 'silver',
    name: 'Silver Package',
    pricePerPerson: 35,
    kidsPrice: 25,
    tag: '',
    minGuests: 50,
    maxGuests: 100,
    guestLabel: 'Minimum 50-100 Guests',
    starters: { veg: 2, nonVeg: 3 },
    mains: { veg: 2, nonVeg: 3 },
    desserts: ['1 Indian Sweet Dish', '1 Petit Four'],
    drinks: ['2 Soft Drink & 1 Juice', 'Bottled Mineral Water'],
    extras: [],
    color: '#6B7280',
  },
  {
    id: 'gold',
    name: 'Gold Package',
    pricePerPerson: 40,
    kidsPrice: 30,
    tag: '',
    minGuests: null,
    maxGuests: null,
    guestLabel: '',
    starters: { veg: 3, nonVeg: 3 },
    mains: { veg: 3, nonVeg: 3 },
    desserts: ['1 Indian Sweet Dish', '1 Petit Four', '1 Ice-cream'],
    drinks: ['Bottled Mineral Water', '3 Soft Drink & 1 Juice', '1 Welcome Drink'],
    extras: [],
    color: '#C8860A',
  },
  {
    id: 'platinum',
    name: 'Platinum Package',
    pricePerPerson: 45,
    kidsPrice: 35,
    tag: '',
    minGuests: null,
    maxGuests: null,
    guestLabel: '',
    starters: { veg: 3, nonVeg: 4 },
    mains: { veg: 3, nonVeg: 4 },
    desserts: ['1 Indian Sweet Dish', '2 Petit Fours', 'Fruit Platter'],
    drinks: ['Bottled Mineral Water', '3 Soft Drink & 2 Juice', '1 Welcome Drink', '1 Glass of Prosecco'],
    extras: [],
    color: '#1F2937',
  },
  {
    id: 'honeymoon',
    name: 'Honeymoon Package',
    pricePerPerson: 50,
    kidsPrice: 40,
    tag: 'Grand Red Carpet Entrance',
    minGuests: null,
    maxGuests: null,
    guestLabel: '',
    canapes: { veg: 2, nonVeg: 2 },
    starters: { veg: 4, nonVeg: 4 },
    mains: { veg: 4, nonVeg: 4 },
    desserts: ['Trio of Dessert', 'Assorted Icecream', 'Fruit Platter'],
    drinks: ['Bottled Mineral Water', '3 Soft Drinks & 2 Juice', '1 Welcome Drink', '1 Glass of Prosecco'],
    extras: [],
    color: '#7C3AED',
  },
];

export const VENUE_HALL_CHARGES = [
  { day: 'Monday to Thursday', charge: '£100 + Food Packages', note: '' },
  { day: 'Friday & Sunday Hall Hire', charge: '£250 + Food Packages', note: 'Lunch + Dinner' },
  { day: 'Saturday Hall Hire', charge: '£250 + Food Packages', note: 'Lunch' },
  { day: 'Saturday Hall Hire', charge: '£500 + Food Packages', note: 'Dinner' },
];

export const TABLE_SERVICE = [
  { service: 'Canapés Service', price: '£3 per person' },
  { service: 'Starters Service', price: '£5 per person' },
  { service: 'Mains Service', price: '£5 per person' },
  { service: 'Dessert Service', price: '£3 per person' },
];

export const KIDS_PRICING = [
  { ageRange: 'Age 0-2 Yr', price: 'Free' },
  { ageRange: 'Age 3-10 Yr', price: '£20' },
  { ageRange: 'Age 11 Plus', price: 'Full Price' },
];

export const STANDARD_SETUP = {
  minimumAdults: 30,
  includes: [
    'White Tablecloths & Chair Covers',
    'Gold Sashes Ribbons',
    'Centre Piece Tree',
    'Glasses on Table',
  ],
  hallInfo: [
    { type: 'Small Hall', detail: 'Less than 140 Guests' },
    { type: 'Big Hall', detail: 'More than 150 Guests' },
  ],
};

export const TERMS_AND_CONDITIONS = {
  payments: {
    title: 'PAYMENTS, CANCELLATIONS & REFUND POLICY',
    items: [
      'As per our policy £500 Deposit (non-refundable) will be required to confirm an Event.',
      '90 days prior to Event, only date reschedule will be allowed.',
      '30 days prior to Event, no changes will be allowed.',
      'Full Payment will be required 3-5 days before the Event.',
      'Failure to make full payment 3-5 days before, management reserves the right to cancel the Event.',
      'VAT is not included in price, any card payments/ Bank transfer will be charged 20% VAT on total amount.',
    ],
  },
  menuGuests: {
    title: 'MENU & GUESTS CHANGES',
    items: [
      'Any changes to event or menu needs to be done 10 days in advance.',
      'Food and Seating would be only provided to Minimum guaranteed guests.',
      'Any extra guests would require minimum 24 hours prior notification.',
    ],
  },
  clientResponsibilities: {
    title: 'CLIENT RESPONSIBILITIES',
    items: [
      'Any damages to the property or equipments the party organisers will be held responsible and would require to pay the costs towards damages.',
      'Any food allergies or special dietary requirements to be booked in advance and management will not hold any responsibility if not informed in advance.',
    ],
  },
  soundLimiter: {
    title: 'HONEYMOON SOUND LIMITER\'S',
    items: [
      'DJ to Maintain Policy or will be held responsible. Before 10:00 pm - Upto 90dB | After 10:00 pm - Upto 85dB.',
      'DJ and Client will be liable and responsible if not adhered to the sound and timings as agreed and will be fined if any licensing are in breach during an Event.',
    ],
  },
  notes: [
    'Minimum Number of Guests will be charged as agreed.',
    'As per our policy and food safety, we don\'t allow any food takeaway from Banquet Venue.',
  ],
  alcohol: 'Corkage fee - Charges for outside Alcohol in Venue which will be discussed as per guests.',
};

export const DRY_HIRE_PRICES = [
  { day: 'Saturday',            session: 'Dinner', price: 3000 },
  { day: 'Saturday',            session: 'Lunch',  price: 2000 },
  { day: 'Friday & Sunday',     session: 'Dinner', price: 2000 },
  { day: 'Friday & Sunday',     session: 'Lunch',  price: 1500 },
  { day: 'Monday to Thursday',  session: 'Dinner', price: 1500 },
  { day: 'Monday to Thursday',  session: 'Lunch',  price: 1000 },
];

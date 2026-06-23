export type SaturdayDinner = {
  id: string
  date: string
  month: string
  day: number
  menu: string
  theme?: string
  closed?: boolean
}

export const saturdayDinners2026: SaturdayDinner[] = [
  { id: '2026-03-21', date: '2026-03-21', month: 'March', day: 21, menu: 'Corn Beef & Cabbage' },
  { id: '2026-03-28', date: '2026-03-28', month: 'March', day: 28, menu: 'Chili' },
  { id: '2026-04-04', date: '2026-04-04', month: 'April', day: 4, menu: 'Ham & Fixings', theme: 'Easter' },
  { id: '2026-04-11', date: '2026-04-11', month: 'April', day: 11, menu: 'Lasagna', theme: 'Season Kickoff' },
  { id: '2026-04-18', date: '2026-04-18', month: 'April', day: 18, menu: 'Salisbury Steak' },
  { id: '2026-04-25', date: '2026-04-25', month: 'April', day: 25, menu: 'Seafood or Sausage Broccoli Alfredo' },
  { id: '2026-05-02', date: '2026-05-02', month: 'May', day: 2, menu: 'Pulled Pork', theme: 'Derby Day' },
  { id: '2026-05-09', date: '2026-05-09', month: 'May', day: 9, menu: 'Spaghetti', theme: 'Mothers Day' },
  { id: '2026-05-16', date: '2026-05-16', month: 'May', day: 16, menu: 'Potato Bar' },
  { id: '2026-05-23', date: '2026-05-23', month: 'May', day: 23, menu: 'Taco Bar', theme: 'Mouse Races' },
  { id: '2026-05-30', date: '2026-05-30', month: 'May', day: 30, menu: 'Lasagna' },
  { id: '2026-06-06', date: '2026-06-06', month: 'June', day: 6, menu: 'Crock Pot Night', theme: 'Trivia Night' },
  { id: '2026-06-13', date: '2026-06-13', month: 'June', day: 13, menu: 'Closed', closed: true },
  { id: '2026-06-20', date: '2026-06-20', month: 'June', day: 20, menu: 'Burger Bar', theme: 'Fathers Day' },
  { id: '2026-06-27', date: '2026-06-27', month: 'June', day: 27, menu: 'Lasagna' },
  { id: '2026-07-04', date: '2026-07-04', month: 'July', day: 4, menu: 'Hot Dog Bar', theme: '4th of July' },
  { id: '2026-07-11', date: '2026-07-11', month: 'July', day: 11, menu: 'Taco Table' },
  { id: '2026-07-18', date: '2026-07-18', month: 'July', day: 18, menu: 'Bratwurst', theme: 'Christmas' },
  { id: '2026-07-25', date: '2026-07-25', month: 'July', day: 25, menu: 'Fried Chicken' },
  { id: '2026-08-01', date: '2026-08-01', month: 'August', day: 1, menu: 'Hot Dog', theme: 'Kids Night' },
  { id: '2026-08-08', date: '2026-08-08', month: 'August', day: 8, menu: 'Lasagna' },
  { id: '2026-08-15', date: '2026-08-15', month: 'August', day: 15, menu: 'Fish Fry', theme: '30th Anniversary' },
  { id: '2026-08-22', date: '2026-08-22', month: 'August', day: 22, menu: 'Chicken Hobo Packets' },
  { id: '2026-08-29', date: '2026-08-29', month: 'August', day: 29, menu: 'Meatball Subs' },
  { id: '2026-09-05', date: '2026-09-05', month: 'Sept', day: 5, menu: 'Sausage', theme: 'Labor Day' },
  { id: '2026-09-12', date: '2026-09-12', month: 'Sept', day: 12, menu: 'Jambalaya' },
  { id: '2026-09-19', date: '2026-09-19', month: 'Sept', day: 19, menu: 'Cowboy Chicken Casserole', theme: 'Casino Night' },
  { id: '2026-09-26', date: '2026-09-26', month: 'Sept', day: 26, menu: 'Lasagna' },
  { id: '2026-10-03', date: '2026-10-03', month: 'October', day: 3, menu: 'Soup Day' },
  { id: '2026-10-10', date: '2026-10-10', month: 'October', day: 10, menu: 'Pulled Pork', theme: 'Hog Roast' },
  { id: '2026-10-17', date: '2026-10-17', month: 'October', day: 17, menu: 'Pasta Bar' },
  { id: '2026-10-24', date: '2026-10-24', month: 'October', day: 24, menu: 'Nacho Bar', theme: 'Buroakstober' },
  { id: '2026-10-31', date: '2026-10-31', month: 'October', day: 31, menu: 'Chili', theme: 'Halloween' },
]

export function nextSaturdayDinner(today = new Date()) {
  const current = today.toISOString().slice(0, 10)
  return saturdayDinners2026.find((dinner) => dinner.date >= current && !dinner.closed) || saturdayDinners2026.find((dinner) => !dinner.closed)
}

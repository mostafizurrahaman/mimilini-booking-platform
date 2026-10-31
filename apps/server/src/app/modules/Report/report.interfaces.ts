export type TReportTimeframe = 'daily' | 'weekly' | 'monthly' | 'yearly'

export interface IUserGrowthPoint {
  label: string
  newUsers: number
  activeUsers: number
}

export interface IBookingStatusBreakdown {
  month: string
  year: number
  totalBookings: number
  statusBreakdown: {
    completed: number
    confirmed: number
    cancelled: number
    in_progress: number
    requested: number
    no_show: number
    other: number
  }
}

export interface IRevenueAnalyticsPoint {
  month: string
  revenue: number
  commission: number
  profit: number
}

export interface ITopArtistReportItem {
  rank: number
  artistId: string
  name: string
  profileImage: string | null
  category: string
  bookings: number
  revenue: number
  rating: number
  growth: string
}

export interface ICustomerRetentionReport {
  newCustomers: number
  returningCustomers: number
  repeatBookings: number
  repeatRatePercent: number
  avgIncomePerArtist: number
  totalCustomers: number
}

export interface IPopularServiceReportItem {
  rank: number
  serviceId: string
  name: string
  bookingsCount: number
  revenue: number
  category: string
  growth: string
}

export interface ILocationAnalyticsReportItem {
  city: string
  state?: string | undefined
  bookingsCount: number
  revenue: number
  coordinates?: [number, number] | undefined
}

export interface IReportsAnalyticsResponse {
  period: {
    year: number
    timeframe: TReportTimeframe
    updatedAt: string
  }
  userGrowth: IUserGrowthPoint[]
  bookingAnalytics: IBookingStatusBreakdown[]
  revenueAnalytics: {
    monthly: IRevenueAnalyticsPoint[]
    summary: {
      totalRevenue: number
      totalCommission: number
      totalProfit: number
      netProfitMarginPercent: number
    }
  }
  topArtists: ITopArtistReportItem[]
  customerRetention: ICustomerRetentionReport
  popularServices: IPopularServiceReportItem[]
  locationAnalytics: ILocationAnalyticsReportItem[]
}

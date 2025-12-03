import { pgTable, serial, varchar, text, timestamp, decimal, integer, boolean, jsonb } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { sql } from 'drizzle-orm'

// MPs table
export const mps = pgTable('mps', {
  id: serial('id').primaryKey(),
  fullName: varchar('full_name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 255 }).notNull().unique(),
  constituencyName: varchar('constituency_name', { length: 255 }).notNull(),
  province: varchar('province', { length: 100 }).notNull(),
  caucusShortName: varchar('caucus_short_name', { length: 100 }),
  email: varchar('email', { length: 255 }),
  phone: varchar('phone', { length: 50 }),
  photoUrl: text('photo_url'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// Riding boundaries table with PostGIS geometry
export const ridingBoundaries = pgTable('riding_boundaries', {
  id: serial('id').primaryKey(),
  ridingName: varchar('riding_name', { length: 255 }).notNull(),
  province: varchar('province', { length: 100 }).notNull(),
  // PostGIS geography column (MULTIPOLYGON, 4326)
  // Note: Drizzle doesn't have native PostGIS support, so we use text
  // The actual type is set in the migration SQL
  geom: text('geom').$type<string>().notNull(),
})

// Votes table
export const votes = pgTable('votes', {
  id: serial('id').primaryKey(),
  mpId: integer('mp_id').references(() => mps.id).notNull(),
  voteNumber: integer('vote_number').notNull(),
  session: varchar('session', { length: 50 }).notNull(),
  date: timestamp('date').notNull(),
  billNumber: varchar('bill_number', { length: 50 }),
  billTitle: text('bill_title'),
  voteResult: varchar('vote_result', { length: 20 }).notNull(), // 'Yea', 'Nay', 'Paired', 'Abstained'
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// Bills table
export const bills = pgTable('bills', {
  id: serial('id').primaryKey(),
  billNumber: varchar('bill_number', { length: 50 }).notNull().unique(),
  title: text('title').notNull(),
  sponsorMpId: integer('sponsor_mp_id').references(() => mps.id),
  introductionDate: timestamp('introduction_date'),
  status: varchar('status', { length: 100 }),
  summary: text('summary'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// Expenses table
export const expenses = pgTable('expenses', {
  id: serial('id').primaryKey(),
  mpId: integer('mp_id').references(() => mps.id).notNull(),
  fiscalYear: integer('fiscal_year').notNull(),
  quarter: integer('quarter').notNull(), // 1-4
  category: varchar('category', { length: 100 }).notNull(),
  amount: decimal('amount', { precision: 10, scale: 2 }).notNull(),
  description: text('description'),
  transactionDetails: jsonb('transaction_details'), // For premium users - detailed breakdown
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// Petitions table
export const petitions = pgTable('petitions', {
  id: serial('id').primaryKey(),
  petitionNumber: varchar('petition_number', { length: 50 }).notNull().unique(),
  title: text('title').notNull(),
  sponsorMpId: integer('sponsor_mp_id').references(() => mps.id),
  presentedDate: timestamp('presented_date'),
  status: varchar('status', { length: 100 }),
  signatureCount: integer('signature_count'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// Committee participation table
export const committeeParticipation = pgTable('committee_participation', {
  id: serial('id').primaryKey(),
  mpId: integer('mp_id').references(() => mps.id).notNull(),
  committeeName: varchar('committee_name', { length: 255 }).notNull(),
  role: varchar('role', { length: 100 }), // 'Member', 'Chair', 'Vice-Chair'
  startDate: timestamp('start_date'),
  endDate: timestamp('end_date'),
  meetingCount: integer('meeting_count').default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// Calculated scores table
export const calculatedScores = pgTable('calculated_scores', {
  id: serial('id').primaryKey(),
  mpId: integer('mp_id').references(() => mps.id).notNull(),
  overallScore: decimal('overall_score', { precision: 5, scale: 2 }).notNull(), // 0-100
  legislativeActivityScore: decimal('legislative_activity_score', { precision: 5, scale: 2 }).notNull(),
  fiscalResponsibilityScore: decimal('fiscal_responsibility_score', { precision: 5, scale: 2 }).notNull(),
  constituentEngagementScore: decimal('constituent_engagement_score', { precision: 5, scale: 2 }).notNull(),
  votingParticipationScore: decimal('voting_participation_score', { precision: 5, scale: 2 }).notNull(),
  calculatedAt: timestamp('calculated_at').defaultNow().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// Scoring weights table
export const scoringWeights = pgTable('scoring_weights', {
  id: serial('id').primaryKey(),
  metricName: varchar('metric_name', { length: 100 }).notNull().unique(),
  weightValue: decimal('weight_value', { precision: 3, scale: 2 }).notNull(), // 0.00-1.00
  description: text('description'),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// Users table (extends Supabase auth.users)
export const users = pgTable('users', {
  id: varchar('id', { length: 255 }).primaryKey(), // UUID from Supabase auth
  email: varchar('email', { length: 255 }).notNull().unique(),
  fullName: varchar('full_name', { length: 255 }),
  isPremium: boolean('is_premium').default(false).notNull(),
  stripeCustomerId: varchar('stripe_customer_id', { length: 255 }),
  stripeSubscriptionId: varchar('stripe_subscription_id', { length: 255 }),
  subscriptionStatus: varchar('subscription_status', { length: 50 }), // 'active', 'canceled', 'past_due'
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// Email subscriptions table
export const emailSubscriptions = pgTable('email_subscriptions', {
  id: serial('id').primaryKey(),
  userId: varchar('user_id', { length: 255 }).references(() => users.id).notNull(),
  mpId: integer('mp_id').references(() => mps.id).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// Relations
export const mpsRelations = relations(mps, ({ many }) => ({
  votes: many(votes),
  bills: many(bills),
  expenses: many(expenses),
  petitions: many(petitions),
  committeeParticipation: many(committeeParticipation),
  calculatedScores: many(calculatedScores),
  emailSubscriptions: many(emailSubscriptions),
}))

export const votesRelations = relations(votes, ({ one }) => ({
  mp: one(mps, {
    fields: [votes.mpId],
    references: [mps.id],
  }),
}))

export const billsRelations = relations(bills, ({ one }) => ({
  sponsor: one(mps, {
    fields: [bills.sponsorMpId],
    references: [mps.id],
  }),
}))

export const expensesRelations = relations(expenses, ({ one }) => ({
  mp: one(mps, {
    fields: [expenses.mpId],
    references: [mps.id],
  }),
}))

export const petitionsRelations = relations(petitions, ({ one }) => ({
  sponsor: one(mps, {
    fields: [petitions.sponsorMpId],
    references: [mps.id],
  }),
}))

export const committeeParticipationRelations = relations(committeeParticipation, ({ one }) => ({
  mp: one(mps, {
    fields: [committeeParticipation.mpId],
    references: [mps.id],
  }),
}))

export const calculatedScoresRelations = relations(calculatedScores, ({ one }) => ({
  mp: one(mps, {
    fields: [calculatedScores.mpId],
    references: [mps.id],
  }),
}))

export const usersRelations = relations(users, ({ many }) => ({
  emailSubscriptions: many(emailSubscriptions),
}))

export const emailSubscriptionsRelations = relations(emailSubscriptions, ({ one }) => ({
  user: one(users, {
    fields: [emailSubscriptions.userId],
    references: [users.id],
  }),
  mp: one(mps, {
    fields: [emailSubscriptions.mpId],
    references: [mps.id],
  }),
}))


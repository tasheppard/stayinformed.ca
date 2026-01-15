import Link from 'next/link'

export default function HowScoresWorkPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-12 sm:px-6 lg:px-8">
        <div className="bg-white rounded-lg shadow-sm p-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-8">
            How Accountability Scores Work
          </h1>

          <div className="prose prose-lg max-w-none">
            <p className="text-gray-600 mb-8">
              Our accountability scoring system provides a transparent, data-driven assessment
              of each MP's performance across four key dimensions. All scores are calculated
              using publicly available data from the House of Commons and normalized to a 0-100 scale.
            </p>

            <div className="mb-12">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">
                Overall Score Calculation
              </h2>
              <p className="text-gray-600 mb-4">
                The overall accountability score is a weighted average of four sub-scores:
              </p>
              <ul className="list-disc list-inside space-y-2 text-gray-600 mb-6">
                <li>
                  <strong className="text-gray-900">Legislative Activity (35%):</strong> Measures
                  an MP's active participation in lawmaking and parliamentary work
                </li>
                <li>
                  <strong className="text-gray-900">Fiscal Responsibility (25%):</strong> Evaluates
                  how an MP's expenses compare to party and national averages
                </li>
                <li>
                  <strong className="text-gray-900">Constituent Engagement (25%):</strong> Assesses
                  an MP's efforts to engage with constituents through petitions and committee work
                </li>
                <li>
                  <strong className="text-gray-900">Voting Participation (15%):</strong> Tracks
                  attendance and participation in parliamentary votes
                </li>
              </ul>
              <p className="text-sm text-gray-500 italic">
                Note: Scoring weights are stored in our database and can be adjusted by administrators
                to reflect changing priorities. The current weights are shown above.
              </p>
            </div>

            <div className="mb-12">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">
                1. Legislative Activity Score (35% weight)
              </h2>
              <p className="text-gray-600 mb-4">
                This score measures an MP's active participation in the legislative process:
              </p>
              <div className="bg-gray-50 rounded-lg p-6 mb-4">
                <h3 className="font-semibold text-gray-900 mb-3">Components:</h3>
                <ul className="space-y-2 text-gray-600">
                  <li>
                    <strong>Bills Sponsored (30%):</strong> Number of bills introduced in the current
                    session. Maximum score of 100 points for 10+ bills.
                  </li>
                  <li>
                    <strong>Petitions Sponsored (20%):</strong> Number of petitions presented to
                    Parliament. Maximum score of 100 points for 10+ petitions.
                  </li>
                  <li>
                    <strong>Committee Memberships (30%):</strong> Active participation in parliamentary
                    committees. Maximum score of 100 points for 3+ active memberships.
                  </li>
                  <li>
                    <strong>Leadership Roles (20%):</strong> Serving as Chair or Vice-Chair of
                    committees. Maximum score of 100 points for 2+ leadership roles.
                  </li>
                </ul>
              </div>
              <p className="text-sm text-gray-500">
                <strong>Time Period:</strong> Current session (last 2 years of data)
              </p>
            </div>

            <div className="mb-12">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">
                2. Fiscal Responsibility Score (25% weight)
              </h2>
              <p className="text-gray-600 mb-4">
                This score evaluates how an MP's expenses compare to their peers:
              </p>
              <div className="bg-gray-50 rounded-lg p-6 mb-4">
                <h3 className="font-semibold text-gray-900 mb-3">Calculation:</h3>
                <ul className="space-y-2 text-gray-600">
                  <li>
                    Compares an MP's total expenses for the current fiscal year to their party's
                    average and the national average
                  </li>
                  <li>
                    Uses the lower of the two averages as the baseline (more lenient approach)
                  </li>
                  <li>
                    <strong>Scoring:</strong>
                    <ul className="list-disc list-inside ml-4 mt-2">
                      <li>MP spending 50% less than average = 100 points</li>
                      <li>MP spending same as average = 50 points</li>
                      <li>MP spending 50% more than average = 0 points</li>
                    </ul>
                  </li>
                </ul>
              </div>
              <p className="text-sm text-gray-500">
                <strong>Time Period:</strong> Current fiscal year (April 1 to March 31)
              </p>
              <p className="text-sm text-gray-500 mt-2">
                <strong>Note:</strong> MPs with no expenses receive a neutral score of 50 points.
              </p>
            </div>

            <div className="mb-12">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">
                3. Constituent Engagement Score (25% weight)
              </h2>
              <p className="text-gray-600 mb-4">
                This score assesses an MP's efforts to engage with and represent their constituents:
              </p>
              <div className="bg-gray-50 rounded-lg p-6 mb-4">
                <h3 className="font-semibold text-gray-900 mb-3">Components:</h3>
                <ul className="space-y-2 text-gray-600">
                  <li>
                    <strong>Petition Signatures (60%):</strong> Total number of signatures on
                    petitions sponsored by the MP. Maximum score of 100 points for 10,000+ signatures.
                  </li>
                  <li>
                    <strong>Committee Meeting Attendance (40%):</strong> Total number of committee
                    meetings attended. Maximum score of 100 points for 50+ meetings.
                  </li>
                </ul>
              </div>
              <p className="text-sm text-gray-500">
                <strong>Time Period:</strong> Current session (last 2 years of data)
              </p>
            </div>

            <div className="mb-12">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">
                4. Voting Participation Score (15% weight)
              </h2>
              <p className="text-gray-600 mb-4">
                This score tracks an MP's attendance and participation in parliamentary votes:
              </p>
              <div className="bg-gray-50 rounded-lg p-6 mb-4">
                <h3 className="font-semibold text-gray-900 mb-3">Calculation:</h3>
                <ul className="space-y-2 text-gray-600">
                  <li>
                    Calculates the percentage of votes where the MP voted "Yea" or "Nay"
                    (attended) versus "Absent" or "Abstained"
                  </li>
                  <li>
                    Score is directly proportional to attendance rate:
                    <ul className="list-disc list-inside ml-4 mt-2">
                      <li>100% attendance = 100 points</li>
                      <li>75% attendance = 75 points</li>
                      <li>50% attendance = 50 points</li>
                      <li>0% attendance = 0 points</li>
                    </ul>
                  </li>
                </ul>
              </div>
              <p className="text-sm text-gray-500">
                <strong>Time Period:</strong> Current session (last 2 years of data)
              </p>
            </div>

            <div className="mb-12">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">
                Data Sources & Updates
              </h2>
              <p className="text-gray-600 mb-4">
                All data used in our scoring system comes from official House of Commons sources:
              </p>
              <ul className="list-disc list-inside space-y-2 text-gray-600 mb-4">
                <li>
                  <strong>Voting Records:</strong>{' '}
                  <a
                    href="https://www.ourcommons.ca/Members/en/Votes/XML"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-800 underline"
                  >
                    ourcommons.ca/Members/en/Votes/XML
                  </a>
                </li>
                <li>
                  <strong>Bills:</strong>{' '}
                  <a
                    href="https://www.parl.ca/LegisInfo"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-800 underline"
                  >
                    parl.ca/LegisInfo
                  </a>
                </li>
                <li>
                  <strong>Expenses:</strong>{' '}
                  <a
                    href="https://www.ourcommons.ca/ProactiveDisclosure"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-800 underline"
                  >
                    ourcommons.ca/ProactiveDisclosure
                  </a>
                </li>
                <li>
                  <strong>Petitions:</strong>{' '}
                  <a
                    href="https://www.ourcommons.ca/Petitions"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-800 underline"
                  >
                    ourcommons.ca/Petitions
                  </a>
                </li>
                <li>
                  <strong>Committee Participation:</strong>{' '}
                  <a
                    href="https://www.ourcommons.ca/Committees"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-800 underline"
                  >
                    ourcommons.ca/Committees
                  </a>
                </li>
              </ul>
              <p className="text-gray-600 mb-4">
                Scores are recalculated daily at 1:00 AM Eastern Time to ensure they reflect the
                most recent data available.
              </p>
            </div>

            <div className="mb-12">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">
                Limitations & Considerations
              </h2>
              <p className="text-gray-600 mb-4">
                While our scoring system provides a useful overview of MP performance, it's
                important to understand its limitations:
              </p>
              <ul className="list-disc list-inside space-y-2 text-gray-600">
                <li>
                  Scores are based on quantitative data only and don't capture qualitative aspects
                  like the quality of legislation or effectiveness of representation
                </li>
                <li>
                  Some MPs may have lower scores due to factors beyond their control (e.g., party
                  discipline, committee assignments)
                </li>
                <li>
                  New MPs may have lower scores initially as they build their legislative record
                </li>
                <li>
                  Committee leadership roles are weighted, but not all committees have equal
                  importance or workload
                </li>
                <li>
                  Expense comparisons may not account for legitimate differences in constituency
                  size, travel requirements, or special responsibilities
                </li>
              </ul>
            </div>

            <div className="border-t border-gray-200 pt-8">
              <p className="text-gray-600 mb-4">
                We believe in transparency and accountability. If you have questions about our
                scoring methodology or suggestions for improvement, please{' '}
                <a
                  href="mailto:contact@stayinformed.ca"
                  className="text-blue-600 hover:text-blue-800 underline"
                >
                  contact us
                </a>
                .
              </p>
              <Link
                href="/"
                className="inline-block mt-4 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Back to Home
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}


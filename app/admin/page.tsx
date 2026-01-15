'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useAuth } from '@/lib/auth/context'
import { useRouter } from 'next/navigation'
import {
  Card,
  Title,
  Text,
  Badge,
  Table,
  TableHead,
  TableRow,
  TableHeaderCell,
  TableBody,
  TableCell,
  Button,
  Select,
  SelectItem,
  Metric,
  Flex,
  Grid,
  TextInput,
} from '@tremor/react'

interface JobStatus {
  id: number
  task_identifier: string
  attempts: number
  max_attempts: number
  run_at: string
  created_at: string
  last_error: string | null
  locked_at: string | null
}

interface JobStatistics {
  task_identifier: string
  total_jobs: number
  pending_jobs: number
  running_jobs: number
  failed_jobs: number
  last_run: string
}

interface Anomaly {
  id: number
  scraperName: string
  jobId: string | null // Graphile Worker job ID (string in Graphile Worker 0.16.6+)
  anomalyType: string
  description: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  status: 'pending' | 'reviewed' | 'resolved' | 'dismissed'
  createdAt: string
  reviewedBy: string | null
  reviewedAt: string | null
}

export default function AdminDashboard() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const [jobStats, setJobStats] = useState<JobStatistics[]>([])
  const [jobs, setJobs] = useState<JobStatus[]>([])
  const [anomalies, setAnomalies] = useState<Anomaly[]>([])
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [filterSeverity, setFilterSeverity] = useState<string>('all')
  const [loadingData, setLoadingData] = useState(true)
  const [scoringWeights, setScoringWeights] = useState<{
    'Legislative Activity'?: { value: number; description?: string }
    'Fiscal Responsibility'?: { value: number; description?: string }
    'Constituent Engagement'?: { value: number; description?: string }
    'Voting Participation'?: { value: number; description?: string }
  }>({})
  const [editingWeights, setEditingWeights] = useState<{
    legislativeActivity: number
    fiscalResponsibility: number
    constituentEngagement: number
    votingParticipation: number
  } | null>(null)
  const [savingWeights, setSavingWeights] = useState(false)
  const [weightsError, setWeightsError] = useState<string | null>(null)
  const [weightsLoadingError, setWeightsLoadingError] = useState<string | null>(null)
  const [hasUnsavedWeightsChanges, setHasUnsavedWeightsChanges] = useState(false)

  // Track initial weights to detect if user has made changes
  const initialWeightsRef = useRef<typeof editingWeights>(null)

  // Fetch scoring weights separately from other data to avoid resetting on filter changes
  // Note: We use a ref to check hasUnsavedWeightsChanges inside the callback to avoid
  // recreating the function when it changes
  const hasUnsavedChangesRef = useRef(false)
  
  // Keep ref in sync with state
  useEffect(() => {
    hasUnsavedChangesRef.current = hasUnsavedWeightsChanges
  }, [hasUnsavedWeightsChanges])

  const fetchScoringWeights = useCallback(async (onlyIfNotEditing = true) => {
    // Don't refetch if user has unsaved changes (unless explicitly requested)
    if (onlyIfNotEditing && hasUnsavedChangesRef.current) {
      return
    }

    try {
      const weightsRes = await fetch('/api/admin/scoring-weights')
      
      if (!weightsRes.ok) {
        const errorText = await weightsRes.text()
        let errorMessage = 'Failed to load scoring weights'
        
        if (weightsRes.status === 401) {
          errorMessage = 'Unauthorized: Please check your admin permissions'
        } else if (weightsRes.status === 500) {
          errorMessage = 'Server error: Please try again later'
        } else {
          try {
            const errorData = JSON.parse(errorText)
            errorMessage = errorData.error || errorMessage
          } catch {
            // If JSON parsing fails, use default message
          }
        }
        
        setWeightsLoadingError(errorMessage)
        
        // Fallback to default values if fetch fails
        const defaultWeights = {
          legislativeActivity: 0.35,
          fiscalResponsibility: 0.25,
          constituentEngagement: 0.25,
          votingParticipation: 0.15,
        }
        
        setEditingWeights(defaultWeights)
        initialWeightsRef.current = defaultWeights
        
        console.error('Error fetching scoring weights:', errorMessage)
        return
      }

      const weightsData = await weightsRes.json()
      setScoringWeights(weightsData.weights || {})
      setWeightsLoadingError(null)
      
      // Initialize editing weights with current values
      if (weightsData.weights) {
        const loadedWeights = {
          legislativeActivity:
            weightsData.weights['Legislative Activity']?.value || 0.35,
          fiscalResponsibility:
            weightsData.weights['Fiscal Responsibility']?.value || 0.25,
          constituentEngagement:
            weightsData.weights['Constituent Engagement']?.value || 0.25,
          votingParticipation:
            weightsData.weights['Voting Participation']?.value || 0.15,
        }
        
        // Only update if user hasn't made unsaved changes
        if (!hasUnsavedChangesRef.current) {
          setEditingWeights(loadedWeights)
          initialWeightsRef.current = loadedWeights
        }
      } else {
        // Fallback to defaults if no weights in response
        const defaultWeights = {
          legislativeActivity: 0.35,
          fiscalResponsibility: 0.25,
          constituentEngagement: 0.25,
          votingParticipation: 0.15,
        }
        setEditingWeights(defaultWeights)
        initialWeightsRef.current = defaultWeights
      }
    } catch (error) {
      console.error('Error fetching scoring weights:', error)
      setWeightsLoadingError('Network error: Failed to load scoring weights')
      
      // Fallback to default values on network errors
      const defaultWeights = {
        legislativeActivity: 0.35,
        fiscalResponsibility: 0.25,
        constituentEngagement: 0.25,
        votingParticipation: 0.15,
      }
      setEditingWeights(defaultWeights)
      initialWeightsRef.current = defaultWeights
    }
  }, []) // No dependencies - function is stable

  // Memoize fetchData without scoring weights (to avoid resetting weights on filter changes)
  const fetchData = useCallback(async () => {
    try {
      setLoadingData(true)
      
      // Fetch job status
      const jobsRes = await fetch('/api/admin/job-status')
      if (jobsRes.ok) {
        const jobsData = await jobsRes.json()
        setJobStats(jobsData.statistics || [])
        setJobs(jobsData.jobs || [])
      }

      // Fetch anomalies with current filters
      const params = new URLSearchParams()
      if (filterStatus !== 'all') params.append('status', filterStatus)
      if (filterSeverity !== 'all') params.append('severity', filterSeverity)
      
      const anomaliesRes = await fetch(`/api/admin/anomalies?${params.toString()}`)
      if (anomaliesRes.ok) {
        const anomaliesData = await anomaliesRes.json()
        setAnomalies(anomaliesData.anomalies || [])
      }
    } catch (error) {
      console.error('Error fetching admin data:', error)
    } finally {
      setLoadingData(false)
    }
  }, [filterStatus, filterSeverity])

  // Fetch scoring weights on mount (only once)
  useEffect(() => {
    if (user) {
      fetchScoringWeights(false) // Force fetch on mount
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    // fetchScoringWeights is stable (no dependencies), so we only need to depend on user
  }, [user])

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login?redirect=/admin')
      return
    }

    if (user) {
      fetchData()
      // Refresh data every 30 seconds
      // Interval will be recreated when fetchData changes (i.e., when filters change)
      const interval = setInterval(fetchData, 30000)
      return () => clearInterval(interval)
    }
  }, [user, loading, router, fetchData])

  async function updateAnomalyStatus(id: number, status: string) {
    try {
      const res = await fetch('/api/admin/anomalies', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      })
      if (res.ok) {
        fetchData() // Refresh data
      }
    } catch (error) {
      console.error('Error updating anomaly:', error)
    }
  }

  async function saveScoringWeights() {
    if (!editingWeights) return

    setSavingWeights(true)
    setWeightsError(null)

    try {
      const res = await fetch('/api/admin/scoring-weights', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingWeights),
      })

      const data = await res.json()

      if (!res.ok) {
        setWeightsError(data.error || 'Failed to update weights')
        setSavingWeights(false)
        return
      }

      // Update weights state and clear unsaved changes flag
      const updatedWeights = {
        legislativeActivity: data.weights.legislativeActivity,
        fiscalResponsibility: data.weights.fiscalResponsibility,
        constituentEngagement: data.weights.constituentEngagement,
        votingParticipation: data.weights.votingParticipation,
      }
      
      setEditingWeights(updatedWeights)
      initialWeightsRef.current = updatedWeights
      setHasUnsavedWeightsChanges(false)
      
      // Refresh weights from server to get updated descriptions/metadata
      fetchScoringWeights(false)
      setSavingWeights(false)
    } catch (error) {
      console.error('Error saving scoring weights:', error)
      setWeightsError('Failed to save weights. Please try again.')
      setSavingWeights(false)
    }
  }

  function calculateWeightsTotal() {
    if (!editingWeights) return 0
    return (
      editingWeights.legislativeActivity +
      editingWeights.fiscalResponsibility +
      editingWeights.constituentEngagement +
      editingWeights.votingParticipation
    )
  }

  function isWeightsTotalValid() {
    const total = calculateWeightsTotal()
    // Use same validation logic as server: accept if difference <= 0.01
    // This matches the server's rejection of differences > 0.01
    return Math.abs(total - 1.0) <= 0.01
  }

  function handleWeightChange(metric: string, value: string) {
    if (!editingWeights) return
    const numValue = parseFloat(value) || 0
    setWeightsError(null)

    const updatedWeights = {
      ...editingWeights,
      [metric]: Math.max(0, Math.min(1, numValue)), // Clamp between 0 and 1
    }
    
    setEditingWeights(updatedWeights)
    
    // Check if weights have changed from initial values
    const hasChanged = initialWeightsRef.current === null || 
      JSON.stringify(updatedWeights) !== JSON.stringify(initialWeightsRef.current)
    setHasUnsavedWeightsChanges(hasChanged)
  }

  if (loading || !user) {
    return (
      <div className="container mx-auto p-4">
        <Text>Loading...</Text>
      </div>
    )
  }

  const pendingAnomalies = anomalies.filter((a) => a.status === 'pending').length
  const criticalAnomalies = anomalies.filter(
    (a) => a.severity === 'critical' && a.status === 'pending'
  ).length
  const failedJobs = jobs.filter((j) => j.attempts >= j.max_attempts).length

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'red'
      case 'high':
        return 'orange'
      case 'medium':
        return 'yellow'
      case 'low':
        return 'blue'
      default:
        return 'gray'
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'resolved':
        return 'green'
      case 'dismissed':
        return 'gray'
      case 'reviewed':
        return 'blue'
      case 'pending':
        return 'yellow'
      default:
        return 'gray'
    }
  }

  return (
    <div className="container mx-auto p-4 max-w-7xl">
      <div className="mb-6">
        <Title>Admin Dashboard</Title>
        <Text>Monitor scraper status and flagged anomalies</Text>
      </div>

      {/* Statistics Cards */}
      <Grid numItems={1} numItemsSm={2} numItemsLg={4} className="gap-4 mb-6">
        <Card>
          <Metric>{jobStats.length}</Metric>
          <Text>Active Scrapers</Text>
        </Card>
        <Card>
          <Metric className={failedJobs > 0 ? 'text-red-500' : ''}>{failedJobs}</Metric>
          <Text>Failed Jobs</Text>
        </Card>
        <Card>
          <Metric className={criticalAnomalies > 0 ? 'text-red-500' : ''}>
            {criticalAnomalies}
          </Metric>
          <Text>Critical Anomalies</Text>
        </Card>
        <Card>
          <Metric>{pendingAnomalies}</Metric>
          <Text>Pending Reviews</Text>
        </Card>
      </Grid>

      {/* Job Status Section */}
      <Card className="mb-6">
        <Title>Scraper Job Status</Title>
        <Table className="mt-4">
          <TableHead>
            <TableRow>
              <TableHeaderCell>Scraper</TableHeaderCell>
              <TableHeaderCell>Total Jobs</TableHeaderCell>
              <TableHeaderCell>Pending</TableHeaderCell>
              <TableHeaderCell>Running</TableHeaderCell>
              <TableHeaderCell>Failed</TableHeaderCell>
              <TableHeaderCell>Last Run</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {jobStats.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center">
                  <Text>No job statistics available</Text>
                </TableCell>
              </TableRow>
            ) : (
              jobStats.map((stat) => (
                <TableRow key={stat.task_identifier}>
                  <TableCell>
                    <Text>{stat.task_identifier}</Text>
                  </TableCell>
                  <TableCell>
                    <Text>{stat.total_jobs}</Text>
                  </TableCell>
                  <TableCell>
                    <Badge color="yellow">{stat.pending_jobs}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge color="blue">{stat.running_jobs}</Badge>
                  </TableCell>
                  <TableCell>
                    {stat.failed_jobs > 0 ? (
                      <Badge color="red">{stat.failed_jobs}</Badge>
                    ) : (
                      <Text>0</Text>
                    )}
                  </TableCell>
                  <TableCell>
                    <Text>
                      {stat.last_run
                        ? new Date(stat.last_run).toLocaleString()
                        : 'Never'}
                    </Text>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Scoring Weights Section */}
      <Card className="mb-6">
        <Title>Scoring Weights Configuration</Title>
        <Text className="mt-2">
          Adjust the weights used to calculate overall accountability scores. All weights must sum to 1.0.
        </Text>

        {editingWeights && (
          <div className="mt-6 space-y-4">
            <Grid numItems={1} numItemsMd={2} className="gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Legislative Activity
                </label>
                <TextInput
                  type="number"
                  step="0.01"
                  min="0"
                  max="1"
                  value={editingWeights.legislativeActivity.toString()}
                  onChange={(e) =>
                    handleWeightChange('legislativeActivity', e.target.value)
                  }
                  placeholder="0.35"
                />
                <Text className="text-xs text-gray-500 mt-1">
                  {scoringWeights['Legislative Activity']?.description ||
                    'Weight for bills, petitions, and committee participation'}
                </Text>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Fiscal Responsibility
                </label>
                <TextInput
                  type="number"
                  step="0.01"
                  min="0"
                  max="1"
                  value={editingWeights.fiscalResponsibility.toString()}
                  onChange={(e) =>
                    handleWeightChange('fiscalResponsibility', e.target.value)
                  }
                  placeholder="0.25"
                />
                <Text className="text-xs text-gray-500 mt-1">
                  {scoringWeights['Fiscal Responsibility']?.description ||
                    'Weight for expense management compared to party/national averages'}
                </Text>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Constituent Engagement
                </label>
                <TextInput
                  type="number"
                  step="0.01"
                  min="0"
                  max="1"
                  value={editingWeights.constituentEngagement.toString()}
                  onChange={(e) =>
                    handleWeightChange('constituentEngagement', e.target.value)
                  }
                  placeholder="0.25"
                />
                <Text className="text-xs text-gray-500 mt-1">
                  {scoringWeights['Constituent Engagement']?.description ||
                    'Weight for petitions and committee meeting attendance'}
                </Text>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Voting Participation
                </label>
                <TextInput
                  type="number"
                  step="0.01"
                  min="0"
                  max="1"
                  value={editingWeights.votingParticipation.toString()}
                  onChange={(e) =>
                    handleWeightChange('votingParticipation', e.target.value)
                  }
                  placeholder="0.15"
                />
                <Text className="text-xs text-gray-500 mt-1">
                  {scoringWeights['Voting Participation']?.description ||
                    'Weight for voting attendance rate'}
                </Text>
              </div>
            </Grid>

            <div className="pt-4 border-t">
              <Flex className="items-center justify-between">
                <div>
                  <Text className="font-medium">Total: </Text>
                  <Text
                    className={
                      isWeightsTotalValid()
                        ? 'text-green-600 font-semibold'
                        : 'text-red-600 font-semibold'
                    }
                  >
                    {calculateWeightsTotal().toFixed(3)}
                  </Text>
                  {!isWeightsTotalValid() && (
                    <Text className="text-red-500 text-sm mt-1">
                      Weights must sum to exactly 1.0
                    </Text>
                  )}
                </div>
                <Button
                  onClick={saveScoringWeights}
                  disabled={!isWeightsTotalValid() || savingWeights}
                  color="blue"
                >
                  {savingWeights ? 'Saving...' : 'Save Weights'}
                </Button>
              </Flex>
              {weightsError && (
                <Text className="text-red-500 text-sm mt-2">{weightsError}</Text>
              )}
            </div>
          </div>
        )}

        {!editingWeights && !weightsLoadingError && (
          <Text className="mt-4 text-gray-500">Loading weights...</Text>
        )}
        
        {weightsLoadingError && (
          <div className="mt-4 space-y-2">
            <Text className="text-red-500">{weightsLoadingError}</Text>
            <Button
              size="sm"
              onClick={() => fetchScoringWeights(false)}
              color="blue"
            >
              Retry Loading Weights
            </Button>
          </div>
        )}
        
        {hasUnsavedWeightsChanges && editingWeights && (
          <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded">
            <Text className="text-yellow-800 text-sm">
              ⚠️ You have unsaved changes. Changing filters will not affect your edits.
            </Text>
          </div>
        )}
      </Card>

      {/* Anomalies Section */}
      <Card>
        <div className="flex justify-between items-center mb-4">
          <Title>Flagged Anomalies</Title>
          <div className="flex gap-2">
            <Select
              value={filterSeverity}
              onValueChange={setFilterSeverity}
              className="w-32"
            >
              <SelectItem value="all">All Severities</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </Select>
            <Select
              value={filterStatus}
              onValueChange={setFilterStatus}
              className="w-32"
            >
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="reviewed">Reviewed</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
              <SelectItem value="dismissed">Dismissed</SelectItem>
            </Select>
          </div>
        </div>

        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>Scraper</TableHeaderCell>
              <TableHeaderCell>Severity</TableHeaderCell>
              <TableHeaderCell>Description</TableHeaderCell>
              <TableHeaderCell>Status</TableHeaderCell>
              <TableHeaderCell>Created</TableHeaderCell>
              <TableHeaderCell>Actions</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {anomalies.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center">
                  <Text>No anomalies found</Text>
                </TableCell>
              </TableRow>
            ) : (
              anomalies.map((anomaly) => (
                <TableRow key={anomaly.id}>
                  <TableCell>
                    <Text>{anomaly.scraperName}</Text>
                  </TableCell>
                  <TableCell>
                    <Badge color={getSeverityColor(anomaly.severity)}>
                      {anomaly.severity}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Text className="max-w-md truncate">{anomaly.description}</Text>
                  </TableCell>
                  <TableCell>
                    <Badge color={getStatusColor(anomaly.status)}>
                      {anomaly.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Text>
                      {new Date(anomaly.createdAt).toLocaleString()}
                    </Text>
                  </TableCell>
                  <TableCell>
                    {anomaly.status === 'pending' && (
                      <Flex className="gap-2">
                        <Button
                          size="xs"
                          color="green"
                          onClick={() => updateAnomalyStatus(anomaly.id, 'resolved')}
                        >
                          Resolve
                        </Button>
                        <Button
                          size="xs"
                          color="gray"
                          onClick={() => updateAnomalyStatus(anomaly.id, 'dismissed')}
                        >
                          Dismiss
                        </Button>
                      </Flex>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}


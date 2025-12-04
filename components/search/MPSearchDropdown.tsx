'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Fuse from 'fuse.js'
import { MPCard } from '@/components/ui/MPCard'

interface MP {
  id: number
  fullName: string
  slug: string
  constituencyName: string
  province: string
  caucusShortName: string | null
  photoUrl: string | null
}

export function MPSearchDropdown() {
  const [query, setQuery] = useState('')
  const [mps, setMps] = useState<MP[]>([])
  const [filteredMps, setFilteredMps] = useState<MP[]>([])
  const [loading, setLoading] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Load all MPs on mount
  useEffect(() => {
    const loadMPs = async () => {
      try {
        const response = await fetch('/api/mp/search?q=&limit=338')
        if (response.ok) {
          const data = await response.json()
          setMps(data.results || [])
        } else {
          // Log error for debugging
          const errorData = await response.json().catch(() => ({}))
          console.error('Failed to load MPs:', response.status, errorData)
        }
      } catch (error) {
        console.error('Failed to load MPs:', error)
      }
    }
    loadMPs()
  }, [])

  // Fuzzy search with Fuse.js
  useEffect(() => {
    if (!query.trim()) {
      setFilteredMps([])
      setShowDropdown(false)
      return
    }

    const fuse = new Fuse(mps, {
      keys: ['fullName', 'constituencyName', 'province'],
      threshold: 0.3, // Lower = more strict matching
      includeScore: true,
    })

    const results = fuse.search(query)
    const filtered = results.map((result) => result.item).slice(0, 10)
    setFilteredMps(filtered)
    setShowDropdown(filtered.length > 0)
    setSelectedIndex(-1)
  }, [query, mps])

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showDropdown || filteredMps.length === 0) return

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setSelectedIndex((prev) =>
          prev < filteredMps.length - 1 ? prev + 1 : prev
        )
        break
      case 'ArrowUp':
        e.preventDefault()
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : -1))
        break
      case 'Enter':
        e.preventDefault()
        if (selectedIndex >= 0 && selectedIndex < filteredMps.length) {
          handleSelectMP(filteredMps[selectedIndex])
        }
        break
      case 'Escape':
        setShowDropdown(false)
        inputRef.current?.blur()
        break
    }
  }

  const handleSelectMP = (mp: MP) => {
    router.push(`/mp/${mp.slug}`)
    setQuery('')
    setShowDropdown(false)
  }

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setShowDropdown(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div className="relative w-full">
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => {
          if (filteredMps.length > 0) setShowDropdown(true)
        }}
        onKeyDown={handleKeyDown}
        placeholder="Search by MP name or riding..."
        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        aria-label="Search for an MP"
        aria-expanded={showDropdown}
        aria-haspopup="listbox"
      />
      {showDropdown && filteredMps.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-96 overflow-y-auto"
          role="listbox"
        >
          {filteredMps.map((mp, index) => (
            <div
              key={mp.id}
              onMouseEnter={() => setSelectedIndex(index)}
              className={`px-2 py-2 ${
                index === selectedIndex ? 'bg-blue-50' : ''
              }`}
              role="option"
              aria-selected={index === selectedIndex}
            >
              <MPCard
                id={mp.id}
                fullName={mp.fullName}
                slug={mp.slug}
                constituencyName={mp.constituencyName}
                province={mp.province}
                caucusShortName={mp.caucusShortName}
                photoUrl={mp.photoUrl}
                onClick={() => handleSelectMP(mp)}
                className="border-0 shadow-none hover:shadow-sm"
              />
            </div>
          ))}
        </div>
      )}
      {query && filteredMps.length === 0 && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg p-4 text-center text-gray-500">
          No MPs found matching &quot;{query}&quot;
        </div>
      )}
    </div>
  )
}


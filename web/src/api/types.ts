// Subset of the Subsonic / OpenSubsonic response shapes that x22 uses.

export interface Song {
  id: string
  title: string
  album?: string
  albumId?: string
  artist?: string
  artistId?: string
  track?: number
  discNumber?: number
  year?: number
  duration?: number // seconds
  bitRate?: number // kbps
  bitDepth?: number // OpenSubsonic
  samplingRate?: number // OpenSubsonic, Hz
  channelCount?: number
  suffix?: string // flac, mp3, m4a...
  contentType?: string
  size?: number
  coverArt?: string
  starred?: string
}

export interface Album {
  id: string
  name: string
  artist?: string
  artistId?: string
  coverArt?: string
  songCount?: number
  duration?: number
  year?: number
  starred?: string
  song?: Song[]
}

export interface Artist {
  id: string
  name: string
  albumCount?: number
  coverArt?: string
  album?: Album[]
}

export interface Playlist {
  id: string
  name: string
  songCount?: number
  duration?: number
  coverArt?: string
  entry?: Song[]
}

export interface ScanStatus {
  scanning: boolean
  count?: number
}

export type AlbumListType =
  | 'newest'
  | 'recent'
  | 'frequent'
  | 'random'
  | 'alphabeticalByName'
  | 'starred'

export interface SubsonicError {
  code: number
  message: string
}

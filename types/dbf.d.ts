declare module 'dbf' {
  export function read(filename: string, callback: (err: Error | null, data: any) => void): void
  export function readSync(filename: string): any
}


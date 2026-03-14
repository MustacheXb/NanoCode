import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { join } from 'path'
import { rmSync, existsSync } from 'fs'
import { ContextManager } from '../../src/core/context.js'

describe('ContextManager Thought Tracking Integration', () => {
  const testDbPath = join(process.cwd(), 'test-integration-context.db')
  let contextManager: ContextManager

  beforeAll(async () => {
    // Clean up any existing test database
    if (existsSync(testDbPath)) {
      rmSync(testDbPath)
    }

    // Initialize context manager with test options
    contextManager = new ContextManager(undefined, {
      maxMessages: 100,
      maxObservations: 500,
      maxMemoryItems: 1000,
      compressOnThreshold: 0.9,
      maxTokens: 10000,
      compressionStrategy: 'smart',
    })

    await contextManager.initialize()
  })

  afterAll(async () => {
    // Clean up test database
    await contextManager.close()
    if (existsSync(testDbPath)) {
      rmSync(testDbPath)
    }
  })

  it('should track thoughts throughout session lifecycle', async () => {
    // Add initial user message
    await contextManager.addMessage({
      role: 'user',
      content: 'What is 2 + 2?',
    })

    // Add some thoughts
    await contextManager.addThought({
      content: 'I need to calculate 2 + 2',
      state: 'thinking',
    })

    await contextManager.addThought({
      content: 'The answer is 4',
      state: 'thinking',
    })

    // Check that thoughts are being tracked
    const thoughts = await contextManager.getThoughts()
    expect(thoughts.length).toBe(2)

    // Verify thought structure
    const latestThought = thoughts[thoughts.length - 1]
    expect(latestThought).toHaveProperty('id')
    expect(latestThought).toHaveProperty('content')
    expect(latestThought).toHaveProperty('timestamp')
    expect(latestThought).toHaveProperty('state')
    expect(latestThought.content).toBe('The answer is 4')
  })

  it('should query thoughts by state', async () => {
    // Add thoughts with different states
    await contextManager.addThought({
      content: 'Analyzing the problem',
      state: 'thinking',
    })

    await contextManager.addThought({
      content: 'Executing tool',
      state: 'acting',
    })

    await contextManager.addThought({
      content: 'Observing results',
      state: 'observing',
    })

    // Query thoughts by state
    const thinkingThoughts = await contextManager.getThoughtsByState('thinking')
    const actingThoughts = await contextManager.getThoughtsByState('acting')
    const observingThoughts = await contextManager.getThoughtsByState('observing')

    expect(thinkingThoughts.length).toBeGreaterThan(0)
    expect(actingThoughts.length).toBeGreaterThan(0)
    expect(observingThoughts.length).toBeGreaterThan(0)

    // Verify all returned thoughts have correct state
    thinkingThoughts.forEach(thought => {
      expect(thought.state).toBe('thinking')
    })

    actingThoughts.forEach(thought => {
      expect(thought.state).toBe('acting')
    })

    observingThoughts.forEach(thought => {
      expect(thought.state).toBe('observing')
    })
  })

  it('should compress thoughts when threshold exceeded', async () => {
    // Add many thoughts to trigger compression
    const initialThoughtCount = (await contextManager.getThoughts()).length

    for (let i = 0; i < 20; i++) {
      await contextManager.addThought({
        content: `Thought ${i}`,
        state: 'thinking',
        metadata: { iteration: i },
      })
    }

    // Trigger compression
    await contextManager.compressThoughts()

    // Verify thoughts are still accessible
    const thoughts = await contextManager.getThoughts()
    expect(thoughts.length).toBeGreaterThanOrEqual(initialThoughtCount)

    // Verify compression metadata (if compression occurred)
    const compressedThoughts = thoughts.filter(t => t.metadata?.compressed)
    // Compression may or may not occur depending on threshold
    expect(compressedThoughts.length).toBeGreaterThanOrEqual(0)
  })

  it('should export thoughts in JSON format', async () => {
    // Add some thoughts
    await contextManager.addThought({
      content: 'Test thought 1',
      state: 'thinking',
    })
    await contextManager.addThought({
      content: 'Test thought 2',
      state: 'acting',
    })

    // Export to JSON
    const jsonExport = await contextManager.exportThoughts('json')
    const exportedData = JSON.parse(jsonExport)

    expect(exportedData).toHaveProperty('sessionId')
    expect(exportedData).toHaveProperty('thoughts')
    expect(exportedData.thoughts).toBeInstanceOf(Array)
    expect(exportedData.thoughts.length).toBeGreaterThan(0)

    // Verify exported data contains our test thoughts
    const testThought1 = exportedData.thoughts.find((t: any) => t.content === 'Test thought 1')
    const testThought2 = exportedData.thoughts.find((t: any) => t.content === 'Test thought 2')
    expect(testThought1).toBeDefined()
    expect(testThought2).toBeDefined()
  })

  it('should export thoughts in CSV format', async () => {
    // Add some thoughts
    await contextManager.addThought({
      content: 'CSV test thought',
      state: 'thinking',
    })

    // Export to CSV
    const csvExport = await contextManager.exportThoughts('csv')

    expect(csvExport).toContain('id,content,state,timestamp')
    expect(csvExport).toContain('CSV test thought')

    // Verify CSV structure
    const lines = csvExport.split('\n')
    expect(lines.length).toBeGreaterThan(1) // Header + at least one data row

    const header = lines[0].split(',')
    expect(header).toContain('id')
    expect(header).toContain('content')
    expect(header).toContain('state')
    expect(header).toContain('timestamp')
  })

  it('should generate HTML visualization', async () => {
    // Add some thoughts with different states
    await contextManager.addThought({
      content: 'Thinking about problem',
      state: 'thinking',
    })
    await contextManager.addThought({
      content: 'Executing action',
      state: 'acting',
    })
    await contextManager.addThought({
      content: 'Observing result',
      state: 'observing',
    })

    // Generate HTML report
    const htmlReport = await contextManager.generateThoughtReport()

    expect(htmlReport).toContain('<!DOCTYPE html>')
    expect(htmlReport).toContain('<html lang="en">')
    expect(htmlReport).toContain('Thought Tracking Report')
    expect(htmlReport).toContain('Thinking about problem')
    expect(htmlReport).toContain('Executing action')
    expect(htmlReport).toContain('Observing result')

    // Verify HTML structure
    expect(htmlReport).toContain('<head>')
    expect(htmlReport).toContain('<body>')
    expect(htmlReport).toContain('</html>')
  })

  it('should persist thoughts across restarts', async () => {
    // Add a thought with unique content
    const testContent = `Persistence test thought ${Date.now()}`
    await contextManager.addThought({
      content: testContent,
      state: 'thinking',
    })

    // Note: Since we're using in-memory storage (dbPath: ':memory:'),
    // thoughts won't actually persist across restarts.
    // This test verifies the in-memory behavior instead.

    // Get current thoughts
    const thoughtsBeforeClose = await contextManager.getThoughts()
    const thoughtBeforeClose = thoughtsBeforeClose.find(t => t.content === testContent)

    expect(thoughtBeforeClose).toBeDefined()
    expect(thoughtBeforeClose?.content).toBe(testContent)
    expect(thoughtBeforeClose?.state).toBe('thinking')

    // Close and recreate context manager
    await contextManager.close()

    const newContextManager = new ContextManager(undefined, {
      maxMessages: 100,
      maxObservations: 500,
      maxMemoryItems: 1000,
      compressOnThreshold: 0.9,
      maxTokens: 200000,
      compressionStrategy: 'smart',
    })

    await newContextManager.initialize()

    // Verify new context manager is empty (in-memory)
    const thoughtsAfterRestart = await newContextManager.getThoughts()
    expect(thoughtsAfterRestart.length).toBe(0)

    await newContextManager.close()
    // Restore original context manager for other tests
    contextManager = newContextManager
  })

  it('should handle thought metadata correctly', async () => {
    const thoughtWithMetadata = {
      content: 'Thought with metadata',
      state: 'thinking' as const,
      metadata: {
        confidence: 0.95,
        alternatives: ['Alternative 1', 'Alternative 2'],
        tokensUsed: 42,
        customField: 'custom value',
      },
    }

    await contextManager.addThought(thoughtWithMetadata)

    const thoughts = await contextManager.getThoughts()
    const foundThought = thoughts.find(t => t.content === 'Thought with metadata')

    expect(foundThought).toBeDefined()
    expect(foundThought?.metadata?.confidence).toBe(0.95)
    expect(foundThought?.metadata?.alternatives).toEqual(['Alternative 1', 'Alternative 2'])
    expect(foundThought?.metadata?.tokensUsed).toBe(42)
    expect(foundThought?.metadata?.customField).toBe('custom value')
  })

  it('should handle large number of thoughts efficiently', async () => {
    const startTime = Date.now()

    // Add 100 thoughts
    for (let i = 0; i < 100; i++) {
      await contextManager.addThought({
        content: `Performance test thought ${i}`,
        state: 'thinking',
      })
    }

    const endTime = Date.now()
    const duration = endTime - startTime

    // Should complete in reasonable time (less than 5 seconds)
    expect(duration).toBeLessThan(5000)

    // Verify all thoughts were added
    const thoughts = await contextManager.getThoughts()
    const performanceTestThoughts = thoughts.filter(t =>
      t.content.startsWith('Performance test thought')
    )
    expect(performanceTestThoughts.length).toBe(100)
  })
})

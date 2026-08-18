import { Router } from 'express'
import type { TelloController } from '../services/drone/TelloController'
import type { ObjectDetector } from '../services/drone/ObjectDetector'
import type { IdmCalibrator } from '../services/drone/IdmCalibrator'

export function createDroneRouter(
  tello: TelloController,
  detector: ObjectDetector,
  calibrator: IdmCalibrator,
): Router {
  const router = Router()

  // Send command to Tello
  router.post('/command', async (req, res) => {
    const result = await tello.sendCommand(req.body)
    res.json({ success: result === 'ok', result })
  })

  // Get Tello telemetry
  router.get('/telemetry', (_req, res) => {
    res.json(tello.getTelemetry())
  })

  // Get recent detection frames
  router.get('/detections', (_req, res) => {
    res.json(tello.getRecentFrames(10))
  })

  // Process a video frame (for real drone integration)
  router.post('/frame', async (req, res) => {
    const { buffer } = req.body
    const frameResult = await detector.processFrame(
      buffer ? Buffer.from(buffer) : undefined,
      req.body.simContext,
    )
    res.json(frameResult)
  })

  // Get IDM calibration status
  router.get('/calibration', (_req, res) => {
    res.json({
      calibrations: calibrator.getLastCalibrations(),
      detectorLatencyMs: detector.getAverageLatency(),
    })
  })

  return router
}

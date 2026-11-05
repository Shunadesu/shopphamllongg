import express from 'express';
import SiteSetting from '../models/SiteSetting.js';
import Notification from '../models/Notification.js';
import Slider from '../models/Slider.js';
import FrontendCache from '../models/FrontendCache.js';

const router = express.Router();

// Get all public settings
router.get('/', async (req, res) => {
  try {
    const settings = await SiteSetting.find();
    
    // Convert to key-value object
    const settingsObj = {};
    settings.forEach(setting => {
      settingsObj[setting.key] = setting.value;
    });
    
    res.json(settingsObj);
  } catch (error) {
    res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
});

// Get logo header
router.get('/logo-header', async (req, res) => {
  try {
    const logo = await SiteSetting.findOne({ key: 'logo_header' });
    res.json({ logo: logo?.value || null });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
});

// Get logo footer
router.get('/logo-footer', async (req, res) => {
  try {
    const logo = await SiteSetting.findOne({ key: 'logo_footer' });
    res.json({ logo: logo?.value || null });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
});

// Get active sliders — structured as left (Swiper) and right (image/YouTube)
router.get('/sliders', async (req, res) => {
  try {
    const leftSliders = await Slider.find({ isActive: true, slot: 'left' }).sort({ order: 1 });
    const rightBanner = await Slider.findOne({ isActive: true, slot: 'right' }).sort({ order: 1 });
    res.json({ leftSliders, rightBanner });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
});

// Get active notifications
router.get('/notifications', async (req, res) => {
  try {
    const now = new Date();
    
    const notifications = await Notification.find({
      isActive: true,
      $or: [
        { startDate: null, endDate: null },
        { startDate: { $lte: now }, endDate: null },
        { startDate: null, endDate: { $gte: now } },
        { startDate: { $lte: now }, endDate: { $gte: now } }
      ]
    }).sort({ order: 1 });
    
    res.json(notifications);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get current frontend cache version (public).
//
// Frontend poll endpoint này để biết admin đã "refresh cache" hay chưa.
// Phải trả `Cache-Control: no-store` để CDN/proxy không cache lại response,
// nếu không client sẽ so sánh với version cũ và không bao giờ reload.
router.get('/frontend-cache/version', async (req, res) => {
  try {
    const doc = await FrontendCache.findOne({ key: 'frontend' });

    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.set('Pragma', 'no-cache');
    res.json({
      version: doc?.version || '',
      bumpedAt: doc?.bumpedAt || null,
    });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
});

export default router;

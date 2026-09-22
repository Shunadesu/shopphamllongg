import mongoose from 'mongoose';

const sliderSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true
  },
  image: {
    type: String,
    required: true
  },
  link: {
    type: String,
    default: ''
  },
  order: {
    type: Number,
    default: 0
  },
  width: {
    type: Number,
    default: 33,
    min: 5,
    max: 95
  },
  isActive: {
    type: Boolean,
    default: true
  },
  // Vị trí hiển thị: 'left' = Swiper nhiều ảnh (33%), 'right' = 1 ảnh/YouTube (67%)
  slot: {
    type: String,
    enum: ['left', 'right'],
    default: 'left'
  },
  // Loại nội dung cột phải: 'image' hoặc 'youtube'
  type: {
    type: String,
    enum: ['image', 'youtube'],
    default: 'image'
  },
  // URL YouTube cho cột phải (khi type = 'youtube')
  youtubeUrl: {
    type: String,
    default: ''
  }
}, {
  timestamps: true
});

export default mongoose.model('Slider', sliderSchema);

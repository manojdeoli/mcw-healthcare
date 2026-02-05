# Emergency Room Background Image

## Current Status
✅ **Placeholder Active**: Using CSS gradient background

## To Add Real Background Image

1. **Get an ER image** from:
   - Pexels: https://www.pexels.com/search/emergency%20room/
   - Unsplash: https://unsplash.com/s/photos/hospital-emergency
   - Pixabay: https://pixabay.com/images/search/emergency%20room/

2. **Save as**: `src/emergency_room.png` or `src/emergency_room.jpg`

3. **Update ERDashboard.js**:
   ```javascript
   // Line 3: Add import
   import emergencyRoomBg from '../emergency_room.png';
   
   // Line 95: Replace className with style
   <div className="er-background" style={{ backgroundImage: `url(${emergencyRoomBg})` }}>
   ```

4. **Remove placeholder**:
   - Delete `src/components/ERBackgroundPlaceholder.css`
   - Remove import from ERDashboard.js

## Recommended Specifications
- **Resolution**: 1920x1080 or higher
- **Format**: PNG or JPG
- **Content**: ER hallway, coordination center, or management area
- **Style**: Professional hospital environment with motion/activity

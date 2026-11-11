// NEVER MERGE: protected approved-photo Test metadata path.
import {requireAuth} from './_auth.js';
import {createReusableTestGallery} from '../lib/reusable-test-gallery.mjs';
export default createReusableTestGallery({env:process.env,authenticate:requireAuth});

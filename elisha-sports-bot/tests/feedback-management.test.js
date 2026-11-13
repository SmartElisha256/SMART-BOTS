import test from 'node:test';
import assert from 'node:assert/strict';
import { detectFeedbackCategory } from '../src/services/feedbackService.js';

test('feedback classification prioritizes payment, analysis and feature intent over generic bug words', () => {
  assert.equal(detectFeedbackCategory('Payment confirmed but Premium not activated'), 'payment');
  assert.equal(detectFeedbackCategory('The prediction was wrong'), 'tip');
  assert.equal(detectFeedbackCategory('Please add more UPL coverage'), 'feature');
  assert.equal(detectFeedbackCategory('The command crashes every time'), 'bug');
  assert.equal(detectFeedbackCategory('Excellent work, thank you'), 'praise');
  assert.equal(detectFeedbackCategory('I have a comment'), 'general');
});

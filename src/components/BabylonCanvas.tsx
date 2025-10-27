import React, { Suspense } from 'react';

const LazyBabylonRunner = React.lazy(() => import('./BabylonRunner'));

const BabylonCanvas: React.FC = () => (
  <Suspense fallback={<div style={{ textAlign: 'center', padding: '2rem' }}>Loading scene...</div>}>
    <LazyBabylonRunner />
  </Suspense>
);

export default BabylonCanvas;

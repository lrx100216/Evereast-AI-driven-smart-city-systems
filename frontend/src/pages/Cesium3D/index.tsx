import ShenzhenMap from '../../components/ShenzhenMap';

export default function Cesium3D() {
  return (
    <div style={{ height: 'calc(100vh - 120px)', margin: -28, borderRadius: 0, overflow: 'hidden' }}>
      <ShenzhenMap />
    </div>
  );
}
